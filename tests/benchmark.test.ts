import {describe,it,expect} from "vitest";
// @ts-ignore The benchmark validator also runs directly in Node.
import {parseCsv,scoreRows,pacingValid} from "../scripts/benchmark/validate.mjs";
const gold=[{asin:"A",title:'Desk lamp, "warm" & bright',price:"",url:"https://example.com/A"}];
describe("independent benchmark validation",()=>{
  it("parses quoted CSV fields, embedded commas, quotes and missing optional values",()=>{
    const text='"asin","title","price","url"\r\n"A","Desk lamp, ""warm"" & bright","","https://example.com/A"\r\n';
    expect(parseCsv(text).rows).toEqual(gold);expect(scoreRows(parseCsv(text).rows,gold).exact).toBe(true);
  });
  it("counts wrong values and rejects duplicate or extra rows, without inflating accuracy",()=>{
    expect(scoreRows([{...gold[0],title:"Wrong"}],gold)).toMatchObject({correctFields:3,expectedFields:4,exact:false});
    expect(scoreRows([gold[0],gold[0]],gold)).toMatchObject({correctFields:0,duplicateRows:1,exact:false});
    expect(scoreRows([gold[0],{...gold[0],asin:"B"}],gold)).toMatchObject({extraRows:1,exact:false});
    expect(()=>parseCsv('a,b\n"unclosed')).toThrow();
  });
  it("requires a completed 3-second delay before each of exactly two page fetches",()=>{
    const delay={phase:"end",tool:"catalog_wait",durationMs:3000,at:3};
    const fetch={phase:"start",tool:"catalog_fetch_page",at:4};
    expect(pacingValid([delay,fetch,delay,fetch])).toBe(true);
    expect(pacingValid([delay,fetch,fetch])).toBe(false);
    expect(pacingValid([{...delay,durationMs:100},fetch,delay,fetch])).toBe(false);
  });
});
