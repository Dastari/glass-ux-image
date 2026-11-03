import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CurvesEditor} from '../../controls/curves.js';
import {LevelsEditor} from '../../controls/levels.js';
import {BalanceWheel,balanceToWheel,wheelToBalance} from '../../controls/balance-wheel.js';
import {BasicAdjustments} from './basic.js';
describe('standalone public controls',()=>{
  it('renders curves, levels and colour balance with no editor session/provider',()=>{
    expect(renderToStaticMarkup(createElement(CurvesEditor))).toContain('Tone curve');
    expect(renderToStaticMarkup(createElement(LevelsEditor))).toContain('Input black');
    expect(renderToStaticMarkup(createElement(BalanceWheel))).toContain('Colour balance');
  });
  it('converts between wheel positions and channel offsets without drift',()=>{
    for(const hue of [0,30,95,180,250,330]){
      const offsets=wheelToBalance({hue,amount:40});
      expect(Math.max(...offsets.map(Math.abs))).toBeCloseTo(40,1);
      const back=balanceToWheel(offsets);
      expect(Math.abs(((back.hue-hue+540)%360)-180)).toBeLessThan(.5);
      expect(back.amount).toBeCloseTo(40,1);
    }
    // Warm hues push red up and blue down; neutral keeps the hue it was given.
    const warm=wheelToBalance({hue:60,amount:50});expect(warm[0]).toBeGreaterThan(0);expect(warm[2]).toBeLessThan(0);
    expect(balanceToWheel([0,0,0],120)).toEqual({hue:120,amount:0});
  });
  it('a simple host can expose only brightness, without rendering advanced controls',()=>{
    const html=renderToStaticMarkup(createElement(BasicAdjustments,{controls:['brightness']}));
    expect(html).toContain('Brightness');expect(html).not.toContain('Contrast');expect(html).not.toContain('Tone curve');
  });
});
