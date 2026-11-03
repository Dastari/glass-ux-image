import {expect,test} from '@playwright/test';
import {developScenes} from '../apps/demo/src/conformance-develop';
const FLOAT_TOLERANCE=0.002;
for(const name of Object.keys(developScenes)) for(const level of [0,1,2]) {
  test(`${name} level ${level}`,async({page})=>{
    await page.goto('/conformance.html');
    await page.waitForFunction(()=>window.conformance);
    const {worst,tiles}=await page.evaluate(([n,l])=>window.conformance.difference(n as string,l as number),[name,level]);
    console.log(`${name}, level ${level}: ${worst.toFixed(6)}, ${tiles} tiles`);
    expect(tiles).toBeGreaterThan(0); expect(worst).toBeLessThan(FLOAT_TOLERANCE);
  });
}
