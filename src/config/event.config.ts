import EventEmitter2 from 'eventemitter2';

export const eventEmitter = new EventEmitter2({
  delimiter: '.',
  newListener: false,
  ignoreErrors: false,
});
