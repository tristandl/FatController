const Gpio = require('pigpio').Gpio;
const awsIot = require('aws-iot-device-sdk');

var thingShadows = awsIot.thingShadow({
     keyPath: 'certs/f119548414-private.pem.key',
    certPath: 'certs/f119548414-certificate.pem.crt',
      caPath: 'certs/VeriSign-Class 3-Public-Primary-Certification-Authority-G5.pem',
    clientId: 'Fatcontroller-01',
        host: 'a1lae8l0b2awl8.iot.us-west-2.amazonaws.com'
});
 
const createInput = (pin) => new Gpio(pin, {
  mode: Gpio.INPUT,
  pullUpDown: Gpio.PUD_DOWN,
  edge: Gpio.EITHER_EDGE
});

const motor = new Gpio(18, {mode: Gpio.OUTPUT});
const sensor1 = createInput(4)
const sensor2 = createInput(17)
const upPulseWidth = 1000
const downPulseWidth = 2000
const increment = 5 
const interval = 20

const NONE = 'none'
const ONE_TRIGGERED = '1'
const ONE_TWO_TRIGGERED = '12'
const TWO_TRIGGERED = '2'
const TWO_ONE_TRIGGERED = '21'
const OPENING = 'opening'
const EXTERNAL_TRIGGER = 'ext'

let state = NONE 
let pulseWidth = upPulseWidth
let timer

motor.servoWrite(upPulseWidth)

const openGates = () => {
  clearInterval(timer)
  timer = setInterval(() => {
    if (pulseWidth <= upPulseWidth) {
      state = NONE
      clearInterval(timer)
    } else {
      pulseWidth -= increment
      motor.servoWrite(pulseWidth);
    }
  }, interval)
}
 
const closeGates = () => {
  clearInterval(timer)
  timer = setInterval(() => {
    if (pulseWidth >= downPulseWidth) {
      clearInterval(timer)
    } else {
      pulseWidth += increment
      motor.servoWrite(pulseWidth);
    }
  }, interval)
}

sensor1.on('interrupt', (level) => {
  console.log(`1 = ${level}: ${state}`)
  if (!level && (state == TWO_TRIGGERED)) {
    state = TWO_ONE_TRIGGERED
  } else if (level && (state == TWO_ONE_TRIGGERED)) {
    state = OPENING
    openGates()
  } else if (!level && (state == NONE)) {
    state = ONE_TRIGGERED
    closeGates()
  }
  console.log(`... ${level}: ${state}`)
})

sensor2.on('interrupt', (level) => {
  console.log(`2 = ${level}: ${state}`)
  if (!level && (state == ONE_TRIGGERED)) {
    state = ONE_TWO_TRIGGERED
  } else if (level && (state == ONE_TWO_TRIGGERED)) {
    state = OPENING
    openGates()
  } else if (!level && (state == NONE)) {
    state = TWO_TRIGGERED
    closeGates()
  }
  console.log(`... ${level}: ${state}`)
})

thingShadows.on('connect', () => {
  thingShadows.subscribe('override');
  thingShadows.register( 'FatController', {}, () => {
    let shadowState = {
      "state": {
        "reported": {
          "gates": "open"
        }
      }
    }
    thingShadows.update('FatController', shadowState)
  })
})

thingShadows.on('message', (topic, payload) => {
  var payload = JSON.parse(payload.toString());

  console.log(`Received message on topic: ${topic}\n${JSON.stringify(payload)}`)
  if (topic == 'override') {
    if (payload.command == 'open') {
      state = OPENING
      openGates()
    } else if (payload.command == 'close') {
      state = EXTERNAL_TRIGGER
      closeGates()
    }
  }
})

var clientTokenUpdate


