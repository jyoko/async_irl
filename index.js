/*
 * This is going to be the home for all the server code.
 *
 */

const log = {
  LOG_LEVEL: 'debug',
  LEVELS: ['trace','debug','info','warn','error','fatal'],
  _color: level=>{
    switch(level) {
      case 'debug': return '#afa';
      case 'info':  return '#0f0';
      case 'warn':  return '#f84';
      case 'error': return '#f48';
      case 'fatal': return '#f00';
      default: return 'inherit';
    }
  },
  _ok: function _ok(level) { return this.LEVELS.indexOf(level) >= this.LEVELS.indexOf(this.LOG_LEVEL); },
};
log._longest = log.LEVELS.reduce((high,word)=>high>word.length?high:word.length,0);
const makeLogger = level=>(...args)=>log._ok(level)&&
  console.log(
    `[${(new Date()).toISOString()}] ` + `(${level.toUpperCase()})`, 
    `${' '.repeat(log._longest-level.length)}`,
    ...args
  );
log.LEVELS.forEach(level=>log[level]=makeLogger(level));


const HTTP_PORT = 3000;
const WS_PORT = 3001;

const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(express.static('public'));

const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', function wssConnection(ws) {
  log.debug('connection');

  let sid = 0;
  ws.on('message', function wssIncoming(msg) {
    log.trace('msg (raw)', msg);
    log.debug('msg (len)', msg.length);
    // TODO move to shared parser
    log.trace('received (len):',msg.length);
    if (msg[0] === '{') {
      try {
        msg = JSON.parse(msg);
      } catch(e) {
        log.error('JSON issue in incoming ws msg',e);
        msg = {error:true,message:'JSON parse',isInstance:false};
      }
    }
    log.info('received (msg):',msg);
    if (sid < 5 && Math.random() > 0.2) {
      const instance = {
        id: 'from_server'+(sid++),
        status: (Math.random()>0.4)?'ok':'bad',
        isInstance: true,
      };
      log.trace('going to send fake server');
      setTimeout(()=>{
        log.info('new fake server',instance);
        ws.send(JSON.stringify(instance));
      }, 5500);
    }
    if (msg==='pong') {
      log.trace('waiting to ping');
      setTimeout(()=>{
        log.debug('pinging');
        ws.send('ping');
      },15500);
    }
  });

  ws.send('stuff');
});

app.listen(HTTP_PORT);
log.info(`started express on ${HTTP_PORT}`);
log.info(`started ws      on ${WS_PORT}`);
