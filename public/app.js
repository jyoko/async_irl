/*
 * All the client side JS lives here
 *
 */

const WS_URI = 'ws://localhost:3001';

/*
 * Quick little logger hack
 *
 * I can unpack it if anything's confusing.
 *
 */
// TODO move to shared
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
    `%c [${(new Date()).toISOString()}] ` + `%c (${level.toUpperCase()})`, 'color:#4af', `color:${log._color(level)}`,
    `${' '.repeat(log._longest-level.length)}`,
    ...args
  );
log.LEVELS.forEach(level=>log[level]=makeLogger(level));


/*
 * Here's where starting stuff gets invoked
 *
 */

// starts the websocket connection
wsConnect();


/*
 * Now we're getting into some async stuff. I opted to use the native WebSocket
 * API here, so we've got a simple event emitter. I'll break down all the
 * pieces individually.
 *
 */

function createEC2EventEmitter(initial=[]) {
  if (!Array.isArray(initial)) throw new TypeError('initial must be an Array');
  const instances = [];
  let listeners = [];
  const waiting = [];
  function subscribeToEC2(fn) {
    log.trace('subscribe to EC2',fn);
    listeners.push(fn);
    while (waiting.length) {
      addEC2Instance(waiting.shift());
    }
    return listeners.length-1;
  }
  function unsubscribeToEC2(ix) {
    log.trace('unsubscribe to EC2',ix);
    listeners.splice(ix, 1);
    return true;
  }
  function addEC2Instance(instance) {
    if (!listeners.length) {
      waiting.push(instance);
      log.info(`instance added (${instance.id}) waiting for listeners`);
      return;
    }
    instances.unshift(instance);
    log.debug('instance added',instance);
    log.trace(`firing ${listeners.length} listeners`);
    listeners.forEach(fn=>fn(instances));
  }
  initial.forEach(instance=>addEC2Instance(instance));
  return {
    subscribeToEC2,
    unsubscribeToEC2,
    addEC2Instance,
  };
}

const {subscribeToEC2, unsubscribeToEC2, addEC2Instance} = createEC2EventEmitter([{id:'foobar_http'}]);

// this var is basically a guard to keep a single page from connecting multiple times
var connected = false;
// this is used to back off or slow down retry attempts
var connectDelay = 1;

// TODO move to shared
const WS_COMMANDS = {
  START: 'start',
  STOP: 'stop',
};

// convenience function to send commands, handles queueing while disconnected
function makeSendMessage() {
  let send = null;
  const pending = [];
  function sendMessage(cmd) {
    if (!send) return pending.push(cmd);
    if (!doPending()) return pending.push(cmd);
    // TODO check open states? apparently can't catch ws closing/closed error.
    // Probably should pass a better function that does it 
    // XXX ENDED HERE ON THAT TRAIN OF THOUGHT START HERE
    try {
      send(cmd);
    } catch(e) {
      log.warn('sendMessage failed',e);
      pending.push(cmd);
      return false;
    }
    return true;
  }
  function setSendMessage(fn) {
    if (typeof fn !== 'function') throw new TypeError('setSendMessage must be given Function');
    send = fn;
    doPending();
  }
  function doPending() {
    while (pending.length) {
      let current = pending.shift();
      try {
        send(current);
      } catch(e) {
        log.warn('sendMessage failed',e);
        pending.unshift(current);
        return false;
      }
    }
    return true;
  }
  return {
    sendMessage,
    setSendMessage,
  };
}
const {sendMessage:_sendMessage, setSendMessage:setSendWsMessage} = makeSendMessage();
function sendWsMessage(instanceId, cmd) {
  log.info(`sending ${cmd} to ${instanceId}`);
  _sendMessage(JSON.stringify({
    instanceId,
    cmd,
  }));
}

// as a function to reuse on reconnect
function wsConnect() {

  // here's the guard
  if (connected) return;
  // should really juggle a connecting and connected or blur the meaning, but
  // it's a demo and I'm lazy

  log.trace('ws connecting');
  const ws = new WebSocket(WS_URI);

  /* 
   * This style of event emitter is old hat if you've spent a lot of time
   * working with browser APIs. Basically instead of thing.on('event',fn) it's
   * thing.onevent = fn.
   *
   * These are important in async concepts because events may happen _multiple
   * times_. Throughout the lifetime of this process (the browser loading our
   * code) and the ws object any of these functions may happen multiple times,
   * unless forbidden by the object API (eg: onopen and onclose should only
   * fire once during the lifetime of the object).
   *
   */

  ws.onopen = function wsOpen(event) {
    // set the guard
    connected = true;
    // reset the delay on a new connection
    connectDelay = 1;
    setSendWsMessage(ws.send.bind(ws));
    log.info('ws connected');
  };

  ws.onmessage = function wsIncoming(event) {
    let msg = event.data;
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
    log.debug('received (msg):',msg);
    if (msg.isInstance) {
      addEC2Instance(msg);
    }
    if (msg === 'ping' || msg === 'stuff') {
      setTimeout(()=>{
        ws.send('pong');
        log.info('ponging');
      },5500);
    }
  };

  ws.onclose = function wsClose() {
    // remove the guard
    connected = false;
    // attempt to reconnect since we never choose to be disconnected. Basic
    // backoff plus some jitter
    const delay = 300*Math.pow(2, connectDelay++)+(1200*Math.random())|0;
    log.warn(`ws closed - reconnect in ~${(delay/1000)|0}s`);
    setTimeout(wsConnect, delay);
  };

  ws.onerror = function wsError(err) {
    // we can't really recover from anything so log it. the close event will
    // fire and do the reconnect
    log.error('ws error',err);
  };

}

/*
 * Enter React
 *
 * Initially I was going to use all native APIs and DOM fragments but I doubt
 * that's too common, so pulled in react. Still avoiding a build step, though,
 * so no JSX.
 *
 * The other big design decision is to prefer functional components and hooks
 * over the classes, but it's largely personal preference -- they'd be
 * functionally (as in usage) equivalent.
 *
 */

const e = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

function EC2List(props) {
  if (props.instances && !Array.isArray(props.instances)) throw new TypeError('EC2List expects array of instances');
  const [instances,setInstances] = useState(props.instances || []);
  let subscribed = null;
  useEffect(()=>{
    function updateInstances(instances) {
      log.trace('updateInstances',instances);
      setInstances(instances.slice());
    }
    if (props.subscribe) {
      subscribed = subscribeToEC2(updateInstances);
    }

    return ()=>{
      unsubscribeToEC2(subscribed);
    };
  }, [props.subscribe]);
  // TODO placeholder
  const [toggled,setToggle] = useState(true);
  let i=0;
  const bottom = [
    e(
      'p',
      {key:++i},
      toggled ? 'toggled' : 'not toggled',
    ),e(
      'button',
      {
        key:++i,
        onClick: ()=>setToggle(!toggled)
      },
      'toggle',
    ),
  ];
  return e('div',
    null,
    instances.map(instance=>e(EC2Card, {key:++i,instance})),
    //bottom,
  );
}

function EC2Card(props) {
  const instance = props.instance;
  // hand-wrote HTML then converted it over
  const card = e(
    'div',
    {className:'card'},
    e('div',{className:'card-header bg-dark'},
      e('ul',{className:'nav nav-tabs card-header-tabs'},
        e('li',{className:'nav-item'},
          e('a',{className:'nav-link active',href:'/'},'Main'),
        ),
        e('li',{className:'nav-item'},
          e('a',{className:'nav-link disabled',href:'/'},'No Other Views'),
        ),
      ),
    ),
    e('div',{className:'card-body'},
      e('h4',{className:'card-title'}, instance.id || 'instance_id_placeholder'),
      e('p',{className:'card-text'},`status: ${instance.status || 'No data available'}`),
      e('a',{className:'btn btn-secondary',href:'#',onClick:()=>sendWsMessage(instance.id,WS_COMMANDS.START)},'Start'),
      e('a',{className:'btn btn-secondary',href:'#',onClick:()=>sendWsMessage(instance.id,WS_COMMANDS.STOP)},'Stop'),
      e('a',{className:'btn btn-secondary disabled',href:'/'},'CHAOS!'),
    ),
  );

  return card;
}

const domContainer = document.getElementById('ec2_list');
ReactDOM.render(e(EC2List,{subscribe:true}), domContainer);
