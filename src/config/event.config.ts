import EventEmitter2 from 'eventemitter2';

const maxListeners = parseInt(process.env.EVENT_EMITTER_MAX_LISTENERS, 10) || 50;

export const eventEmitter = new EventEmitter2({
  delimiter: '.',
  newListener: false,
  ignoreErrors: false,
  maxListeners: maxListeners,
});
