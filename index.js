const Gpio = require('pigpio').Gpio;
const awsIot = require('aws-iot-device-sdk');

let thingShadows = awsIot.thingShadow({
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

const OPEN = 'open'
const OPENING = 'opening'
const CLOSED = 'closed'
const CLOSING = 'closing'

const NONE = 'none'
const ONE_TRIGGERED = '1'
const ONE_TWO_TRIGGERED = '12'
const TWO_TRIGGERED = '2'
const TWO_ONE_TRIGGERED = '21'
const EXTERNAL_TRIGGER = 'ext'

let inflightOperations = new Set()
let messageQueue = []
const update = s => {
  console.log('New update...')
  if (inflightOperations.size == 0) {
    sendUpdate(s)
  } else {
    messageQueue.push(s)
    console.log('...enqueing message:')
    console.log(messageQueue)
  }
}

const sendUpdate = s => {
  console.log('...sending update:')
  console.log(s)
  clientTokenUpdate = thingShadows.update('FatController', createReportedState(s))
  if (clientTokenUpdate === null) {
    console.log('update shadow failed, operation still in progress')
  } else {
    inflightOperations.add(clientTokenUpdate)
  }
}

const setGateState = s => {
  console.log(`${gateState} => ${s}`)
  gateState = s
  update({gateState: gateState})
}

const setSensorState = s => {
  console.log(`${sensorState} => ${s}`)
  sensorState = s
  update({sensorState: sensorState})
}

const createReportedState = s => {
  return {
    "state": {
      "reported": s
    }
  }
}

let gateState = OPEN 
let sensorState = NONE
let pulseWidth = upPulseWidth
let timer

motor.servoWrite(upPulseWidth)

const openGates = () => {
  clearInterval(timer)
  setGateState(OPENING)
  timer = setInterval(() => {
    if (pulseWidth <= upPulseWidth) {
      setGateState(OPEN)
      clearInterval(timer)
    } else {
      pulseWidth -= increment
      motor.servoWrite(pulseWidth);
    }
  }, interval)
}
 
const closeGates = () => {
  clearInterval(timer)
  setGateState(CLOSING)
  timer = setInterval(() => {
    if (pulseWidth >= downPulseWidth) {
      setGateState(CLOSED)
      clearInterval(timer)
    } else {
      pulseWidth += increment
      motor.servoWrite(pulseWidth);
    }
  }, interval)
}

sensor1.on('interrupt', (level) => {
  if (!level && (sensorState == TWO_TRIGGERED)) {
    setSensorState(TWO_ONE_TRIGGERED)
  } else if (level && (sensorState == TWO_ONE_TRIGGERED)) {
    setSensorState(NONE)
    openGates()
  } else if (!level && (sensorState == NONE)) {
    setSensorState(ONE_TRIGGERED)
    closeGates()
  }
})

sensor2.on('interrupt', (level) => {
  if (!level && (sensorState == ONE_TRIGGERED)) {
    setSensorState(ONE_TWO_TRIGGERED)
  } else if (level && (sensorState == ONE_TWO_TRIGGERED)) {
    setSensorState(NONE)
    openGates()
  } else if (!level && (sensorState == NONE)) {
    setSensorState(TWO_TRIGGERED)
    closeGates()
  }
})

thingShadows.on('connect', () => {
  thingShadows.subscribe('override');
  thingShadows.register( 'FatController', {}, () => {
    const initialState = createReportedState({gateState: gateState, sensorState: sensorState})
    thingShadows.update('FatController', initialState)
  })
})

thingShadows.on('status', (thingName, stat, clientToken, stateObject) => {
  inflightOperations.delete(clientToken)
  if (messageQueue.length > 0) {
    const nextUpdate = messageQueue.shift()
    console.log('...dequeueing message:')
    console.log(messageQueue)
    sendUpdate(nextUpdate)
  }
})

thingShadows.on('message', (topic, jsonPayload) => {
  let payload = JSON.parse(jsonPayload.toString());

  console.log(`Received message on topic: ${topic}\n${JSON.stringify(payload)}`)
  if (topic == 'override') {
    if (payload.command == 'open') {
      openGates()
    } else if (payload.command == 'close') {
      setGateState(EXTERNAL_TRIGGER)
      closeGates()
    }
  }
})

let clientTokenUpdate


