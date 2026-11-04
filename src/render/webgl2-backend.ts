import { BLEND_MODES } from "../core/document.js";
import { blendGlsl } from "./blend.js";
import type { FilterPass, PixelBuffer } from "../core/index.js";
import type { BackendInfo, BlendOptions, Draw, PresentOptions, RenderBackend, Surface } from "./types.js";
import { BackendUnavailableError } from "./types.js";

const FULL_QUAD = /* glsl */ `#version 300 es
void main() {
  vec2 corner = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRESENT_VERTEX = /* glsl */ `#version 300 es
uniform vec4 uTarget;
uniform vec4 uSource;
uniform vec2 uCanvas;
uniform vec2 uTexture;
out vec2 vUv;
void main() {
  vec2 corner = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1);
  vec2 position = (uTarget.xy + corner * uTarget.zw) / uCanvas;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  vUv = (uSource.xy + corner * uSource.zw) / uTexture;
}`;

const PRESENT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform float uManualLinear;
in vec2 vUv;
out vec4 outColor;
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec4 c;
  if(uManualLinear > .5) {
    // RGBA32F linear filtering is optional in WebGL2; texelFetch needs no extension.
    vec2 position=vUv*vec2(textureSize(uImage,0))-.5;
    ivec2 p=ivec2(floor(position)),last=textureSize(uImage,0)-1;
    vec2 f=fract(position);
    vec4 a=texelFetch(uImage,clamp(p,ivec2(0),last),0);
    vec4 b=texelFetch(uImage,clamp(p+ivec2(1,0),ivec2(0),last),0);
    vec4 d=texelFetch(uImage,clamp(p+ivec2(0,1),ivec2(0),last),0);
    vec4 e=texelFetch(uImage,clamp(p+ivec2(1,1),ivec2(0),last),0);
    c=mix(mix(a,b,f.x),mix(d,e,f.x),f.y);
  } else c=texture(uImage,vUv);
  vec3 straight = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  outColor = vec4(encode(clamp(straight, 0.0, 1.0)) * c.a, c.a);
}`;

/** The transparency grid: squares counted from the document's corner, in device pixels, top-left origin. */
const GRID_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uTarget;
uniform vec2 uCanvas;
uniform float uCell;
uniform vec3 uFirst;
uniform vec3 uSecond;
out vec4 outColor;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) - uTarget.xy;
  vec2 square = floor(p / uCell);
  outColor = vec4(mix(uFirst, uSecond, mod(square.x + square.y, 2.0)), 1.0);
}`;

/** The formulas match `blendPixels` in the CPU backend. */
const BLEND_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uBase;
uniform sampler2D uTop;
uniform vec2 uOffset;
uniform float uOpacity;
uniform float uMode;
out vec4 outColor;
${blendGlsl}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 d = texelFetch(uBase, p, 0);
  vec4 s = texelFetch(uTop, p + ivec2(uOffset), 0) * uOpacity;
  vec3 b = d.a > 0. ? d.rgb/d.a : vec3(0);
  vec3 a = s.a > 0. ? s.rgb/s.a : vec3(0);
  vec3 c = s.rgb*(1.-d.a)+d.rgb*(1.-s.a)+s.a*d.a*blendColour(b,a,int(uMode));
  outColor = vec4(c, s.a + d.a * (1.0 - s.a));
}`;

const passFragment = (body: string) => /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uSource;
out vec4 outColor;
${body}
void main() {
  outColor = filterPixel(ivec2(gl_FragCoord.xy));
}`;



const POOL_LIMIT = 256;

class GlSurface implements Surface {
  constructor(
    readonly texture: WebGLTexture,
    readonly width: number,
    readonly height: number,
    readonly precision: "half" | "full",
  ) {}
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

/** WebGL2 rendering backend with pooled surfaces and context-loss reporting. Dispose it after detaching the renderer. */
export class WebGL2Backend implements RenderBackend {
  readonly info: BackendInfo;
  readonly canvas: HTMLCanvasElement;
  #gl: WebGL2RenderingContext;
  #frame: WebGLFramebuffer;
  #vao: WebGLVertexArrayObject;
  #programs = new Map<string, Program>();
  #pool = new Map<string, GlSurface[]>();
  #pooled = 0;
  #live = 0;
  #lost = new Set<(reason: string) => void>();
  #isLost = false;

  constructor(canvas = document.createElement("canvas")) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new BackendUnavailableError("WebGL2 is not available");
    if (!gl.getExtension("EXT_color_buffer_float")) throw new BackendUnavailableError("This GPU cannot render to float textures");
    this.#gl = gl;
    this.#frame = gl.createFramebuffer();
    this.#vao = gl.createVertexArray();
    gl.bindVertexArray(this.#vao);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? (gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string) : undefined;
    this.info = { kind: "webgl2", ...(renderer ? { renderer } : {}) };

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.#isLost = true;
      for (const listener of this.#lost) listener("The GPU context was lost");
    });
  }

  get bytes() {
    return this.#live;
  }

  get lost() {
    return this.#gl.isContextLost();
  }

  allocate(width: number, height: number, precision: "half" | "full" = "half"): GlSurface {
    const surface = this.#pool.get(`${width}x${height}/${precision}`)?.pop();
    this.#live += width * height * (precision === "full" ? 16 : 8);
    const gl = this.#gl;
    if (surface) {
      // A reused texture still holds its last pixels. New ones start transparent.
      this.#pooled--;
      this.#target(surface);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return surface;
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, precision === "full" ? gl.RGBA32F : gl.RGBA16F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return new GlSurface(texture, width, height, precision);
  }

  upload({ width, height, data }: PixelBuffer, precision: "half" | "full" = "half") {
    const gl = this.#gl;
    const surface = this.allocate(width, height, precision);
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data);
    return surface;
  }

  release(surface: Surface) {
    const { width, height, texture, precision } = surface as GlSurface;
    this.#live -= width * height * (precision === "full" ? 16 : 8);
    if (this.#pooled >= POOL_LIMIT) {
      this.#gl.deleteTexture(texture);
      return;
    }
    const key = `${width}x${height}/${precision}`;
    const list = this.#pool.get(key) ?? [];
    list.push(surface as GlSurface);
    this.#pool.set(key, list);
    this.#pooled++;
  }

  #program(key: string, vertex: string, fragment: string): Program {
    const known = this.#programs.get(key);
    if (known) return known;
    const gl = this.#gl;
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(`Shader "${key}" did not compile: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Shader "${key}" did not link: ${gl.getProgramInfoLog(program)}`);
    }
    const entry = { program, uniforms: new Map() };
    this.#programs.set(key, entry);
    return entry;
  }

  #uniform({ program, uniforms }: Program, name: string) {
    if (!uniforms.has(name)) uniforms.set(name, this.#gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  }

  #bindTexture(entry: Program, name: string, unit: number, surface: GlSurface) {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, surface.texture);
    gl.uniform1i(this.#uniform(entry, name), unit);
  }

  #target(surface: GlSurface) {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, surface.texture, 0);
    gl.viewport(0, 0, surface.width, surface.height);
    gl.disable(gl.BLEND);
  }

  runPass(pass: FilterPass, source: Surface, target: Surface, inputs: Readonly<Record<string, Surface>> = {}) {
    const gl = this.#gl;
    const entry = this.#program(`pass:${pass.id}`, FULL_QUAD, passFragment(pass.glsl));
    this.#target(target as GlSurface);
    gl.useProgram(entry.program);
    this.#bindTexture(entry, "uSource", 0, source as GlSurface);
    let unit = 1;
    for (const [name, surface] of Object.entries(inputs)) this.#bindTexture(entry, name, unit++, surface as GlSurface);
    const textures: WebGLTexture[] = [];
    for (const [name, data] of Object.entries(pass.textures ?? {})) {
      const texture = gl.createTexture();
      textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, data.width, data.height, 0, gl.RGBA, gl.FLOAT, data.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.uniform1i(this.#uniform(entry, name), unit++);
    }
    for (const [name, value] of Object.entries(pass.uniforms)) {
      const location = this.#uniform(entry, name);
      if (typeof value === "number") gl.uniform1f(location, value);
      else if (value.length === 2) gl.uniform2f(location, value[0]!, value[1]!);
      else if (value.length === 3) gl.uniform3f(location, value[0]!, value[1]!, value[2]!);
      else if (value.length === 4) gl.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
      else gl.uniform1fv(location, value as number[]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (const texture of textures) gl.deleteTexture(texture);
  }

  blend(base: Surface, top: Surface, { offsetX, offsetY, mode, opacity }: BlendOptions) {
    const gl = this.#gl;
    const out = this.allocate(base.width, base.height, (base as GlSurface).precision);
    const entry = this.#program("blend", FULL_QUAD, BLEND_FRAGMENT);
    this.#target(out);
    gl.useProgram(entry.program);
    this.#bindTexture(entry, "uBase", 0, base as GlSurface);
    this.#bindTexture(entry, "uTop", 1, top as GlSurface);
    gl.uniform2f(this.#uniform(entry, "uOffset"), offsetX, offsetY);
    gl.uniform1f(this.#uniform(entry, "uOpacity"), opacity);
    gl.uniform1f(this.#uniform(entry, "uMode"), BLEND_MODES.indexOf(mode));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return out;
  }

  read(surface: Surface): PixelBuffer {
    const gl = this.#gl;
    const { width, height } = surface;
    this.#target(surface as GlSurface);
    const data = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data);
    return { width, height, data };
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  present(draws: readonly Draw[], { background, pixelated, grid }: PresentOptions) {
    if (this.#isLost) return;
    const gl = this.#gl;
    const { width, height } = this.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (grid && grid.rect.width > 0 && grid.rect.height > 0) {
      gl.disable(gl.BLEND);
      const checker = this.#program("grid", PRESENT_VERTEX, GRID_FRAGMENT);
      gl.useProgram(checker.program);
      gl.uniform2f(this.#uniform(checker, "uCanvas"), width, height);
      gl.uniform4f(this.#uniform(checker, "uTarget"), grid.rect.x, grid.rect.y, grid.rect.width, grid.rect.height);
      gl.uniform1f(this.#uniform(checker, "uCell"), grid.cell);
      gl.uniform3f(this.#uniform(checker, "uFirst"), ...grid.colours[0]);
      gl.uniform3f(this.#uniform(checker, "uSecond"), ...grid.colours[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const entry = this.#program("present", PRESENT_VERTEX, PRESENT_FRAGMENT);
    gl.useProgram(entry.program);
    gl.uniform2f(this.#uniform(entry, "uCanvas"), width, height);
    const filter = pixelated ? gl.NEAREST : gl.LINEAR;
    for (const { surface, source: s, target: t } of draws) {
      this.#bindTexture(entry, "uImage", 0, surface as GlSurface);
      const full=(surface as GlSurface).precision==="full";
      gl.uniform1f(this.#uniform(entry,"uManualLinear"),full && !pixelated ? 1 : 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, full ? gl.NEAREST : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, full ? gl.NEAREST : filter);
      gl.uniform2f(this.#uniform(entry, "uTexture"), surface.width, surface.height);
      gl.uniform4f(this.#uniform(entry, "uSource"), s.x, s.y, s.width, s.height);
      gl.uniform4f(this.#uniform(entry, "uTarget"), t.x, t.y, t.width, t.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  onLost(listener: (reason: string) => void) {
    this.#lost.add(listener);
    return () => void this.#lost.delete(listener);
  }

  dispose() {
    this.#gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
