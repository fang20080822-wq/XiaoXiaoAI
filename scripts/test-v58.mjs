import assert from "node:assert/strict";
import {registerV58Routes} from "../upgrade-v58.js";

const routes=[];
const calls=[];
let owned=true;
const app={patch:(path,...handlers)=>routes.push({path,handler:handlers.at(-1)})};
const db={query:async(sql,params)=>{
  calls.push({sql,params});
  if(!owned)return {rowCount:0,rows:[]};
  return {rowCount:1,rows:[{id:params[1],class_name:"demo",group:params[0]}]};
}};
registerV58Routes({
  app,db,apiLimiter:(req,res,next)=>next(),requireTeacher:(req,res,next)=>next(),
  teacherId:()=> "teacher-1",requireDatabase:(req,res,next)=>next()
});
const route=routes.find(x=>x.path==="/api/teacher/classes/:id/group");
assert.ok(route,"group route is registered");

async function invoke(body,id="123e4567-e89b-42d3-a456-426614174000"){
  const result={statusCode:200,body:null};
  const res={
    status(code){result.statusCode=code;return this;},
    json(value){result.body=value;return this;}
  };
  await route.handler({body,params:{id}},res);
  return result;
}

let result=await invoke({group:"invalid"});
assert.equal(result.statusCode,400);
assert.equal(calls.length,0);

result=await invoke({group:"experimental"});
assert.equal(result.statusCode,200);
assert.equal(result.body.class.group,"experimental");
assert.match(calls[0].sql,/WHERE id=\$2 AND teacher_id=\$3/);
assert.deepEqual(calls[0].params,["experimental","123e4567-e89b-42d3-a456-426614174000","teacher-1"]);

result=await invoke({group:"control"});
assert.equal(result.statusCode,200);
assert.equal(result.body.class.group,"control");

owned=false;
result=await invoke({group:"control"});
assert.equal(result.statusCode,404);
console.log("v58 class group route tests passed");
