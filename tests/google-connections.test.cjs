const test=require('node:test'),assert=require('node:assert/strict');
const {GmailClient,READ,SEND,rawMessage,plainText}=require('../zorifi-google-connections.js');
const {FirebaseGateway,normalizeConfig}=require('../zorifi-firebase.js');
const grant=(scope=READ)=>({access_token:'google-test-token',scope,expires_in:3600});
test('Google Firebase sign-in exchanges a Google credential and persists only a verified Firebase session',async()=>{
 let call;const gateway=new FirebaseGateway({apiKey:'public-key',projectId:'test'},async(url,options)=>{call={url,options};return Response.json({localId:'verified-uid',email:'creator@example.com',displayName:'Creator',idToken:'firebase-token',refreshToken:'firebase-refresh',expiresIn:3600,isNewUser:true});});
 const result=await gateway.signInWithGoogle('a.b.c','https://zorifi.vercel.app/');
 assert.equal(result.uid,'verified-uid');assert(!('idToken' in result));assert.equal(gateway.session.refreshToken,'firebase-refresh');assert.match(call.url,/accounts:signInWithIdp/);assert.equal(new URLSearchParams(JSON.parse(call.options.body).postBody).get('providerId'),'google.com');assert.equal(JSON.parse(call.options.body).returnIdpCredential,false);
 await assert.rejects(gateway.signInWithGoogle('a.b.c','http://evil.example/'),/HTTPS/);await assert.rejects(gateway.signInWithGoogle('a.b.c','https://zorifi.vercel.app/?token=bad'),/secure/);
});
test('Google sign-in late responses never restore a logged-out account',async()=>{
 let resolve;const gateway=new FirebaseGateway({apiKey:'public-key',projectId:'test'},()=>new Promise(r=>resolve=r));const pending=gateway.signInWithGoogle('a.b.c','https://zorifi.vercel.app/');gateway.signOut();resolve(Response.json({localId:'old',email:'old@example.com',idToken:'id',refreshToken:'refresh'}));await assert.rejects(pending,/session changed/);assert.equal(gateway.session,null);
});
test('Gmail read and send require separate explicitly granted permissions',async()=>{
 let calls=0;const client=new GmailClient({owner:'one',getOwner:()=> 'one',transport:async(url,options)=>{calls++;assert(url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/'));assert.equal(options.headers.Authorization,'Bearer google-test-token');return Response.json({id:'sent'});}});
 await assert.rejects(client.list(),/Reconnect/);client.grant(grant());await client.list();await assert.rejects(client.send({to:'you@example.com',subject:'Hi',body:'Hello'}),/Allow Send/);assert.equal(calls,1);client.grant(grant(SEND));await client.send({to:'you@example.com',subject:'Hi',body:'Hello'});await assert.rejects(client.list(),/Allow Read/);assert.equal(calls,2);client.disconnect();assert.equal(client.token,'');
});
test('Gmail rejects late data after account changes, disconnects or reconnects',async()=>{
 let uid='one',resolve;const client=new GmailClient({owner:uid,getOwner:()=>uid,transport:()=>new Promise(r=>resolve=r)});client.grant(grant());const old=client.list();client.grant(grant());resolve(Response.json({messages:[{id:'old-account'}]}));await assert.rejects(old,/connection changed/);
 const switched=client.list();uid='two';resolve(Response.json({messages:[]}));await assert.rejects(switched,/account changed/);assert.equal(client.token,'');
});
test('Gmail never retries a send and clears rejected/expired access',async()=>{
 let calls=0;const client=new GmailClient({owner:'one',getOwner:()=> 'one',transport:async()=>{calls++;return new Response('{}',{status:401});}});client.grant(grant(SEND));await assert.rejects(client.send({to:'you@example.com',subject:'Hi',body:'Hello'}),/expired/);assert.equal(calls,1);assert.equal(client.token,'');client.grant(grant());client.expiresAt=0;await assert.rejects(client.list(),/expires/);assert.equal(calls,1);
});
test('mail encoding handles Unicode and maximum bodies, rejecting header injection',()=>{
 const raw=rawMessage({to:'you@example.com',subject:'Hello ☀',body:'🎬'.repeat(15000)});const decoded=Buffer.from(raw,'base64url').toString('utf8');assert(decoded.includes('🎬'.repeat(15000)));assert.match(decoded,/Subject: =\?UTF-8\?B\?/);
 for(const draft of [{to:'you@example.com\r\nBcc: attacker@example.com',subject:'Hello',body:'Hi'},{to:'you@example.com',subject:'Hi\nBcc: x',body:'Hi'},{to:'you@example.com',subject:'Hi',body:'x'.repeat(30001)}])assert.throws(()=>rawMessage(draft));
 const part={mimeType:'multipart/alternative',parts:[{mimeType:'text/html',body:{data:Buffer.from('<script>bad()</script>').toString('base64url')}},{mimeType:'text/plain',body:{data:Buffer.from('Readable message').toString('base64url')}}]};assert.equal(plainText(part),'Readable message');
});
test('public Firebase additions never accept arbitrary URLs, secrets or truthy string feature flags',()=>{
 const c=normalizeConfig({apiKey:'public',projectId:'test',googleClientId:'123-test.apps.googleusercontent.com',storageBucket:'test.firebasestorage.app',socialMediaEnabled:'true',clientSecret:'never-include'});assert.equal(c.googleClientId,'123-test.apps.googleusercontent.com');assert.equal(c.storageBucket,'test.firebasestorage.app');assert.equal(c.socialMediaEnabled,false);assert(!('clientSecret'in c));assert.equal(normalizeConfig({storageBucket:'evil.example',googleClientId:'https://evil.example'}).storageBucket,'');
});
