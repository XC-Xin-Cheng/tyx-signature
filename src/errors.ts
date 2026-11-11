export class SignatureError extends Error {
 constructor(public code:string,message:string,public hint?:string){super(message);this.name='SignatureError';}
}
export function errorMessage(e:unknown){return e instanceof Error?e.message:String(e);}
