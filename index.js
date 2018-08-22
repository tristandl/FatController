/* --- GPIO SETUP --- */
const Gpio = require('pigpio').Gpio

const createInput = (pin) => {
  const input = new Gpio(pin, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_DOWN,
    alert: true
  })
  input.glitchFilter(25000) // microseconds
  return input
}

const motor = new Gpio(18, {mode: Gpio.OUTPUT})
const sensor1 = createInput(4)
const sensor2 = createInput(17)
const upPulseWidth = 1000
const downPulseWidth = 2000
const increment = 5 
const interval = 20

motor.servoWrite(upPulseWidth)

/* --- AWS IoT SETUP --- */
const awsIot = require('aws-iot-device-sdk')

let thingShadows = awsIot.thingShadow({
     keyPath: 'certs/f119548414-private.pem.key',
    certPath: 'certs/f119548414-certificate.pem.crt',
      caPath: 'certs/VeriSign-Class 3-Public-Primary-Certification-Authority-G5.pem',
    clientId: 'Fatcontroller',
        host: 'a1lae8l0b2awl8.iot.us-west-2.amazonaws.com'
})
 
/* --- CONSTANTS --- */
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

/* --- MESSAGE QUEUEING & THING UPDATES --- */
let inflightOperations = new Set()
let messageQueue = []
let clientTokenUpdate

const update = s => {
  console.log('New update...')
  if (inflightOperations.size == 0) {
    sendUpdate(createReportedState(s))
  } else {
    console.log(`...enqueing message. ${messageQueue.length} exist already`)
    messageQueue.push(createReportedState(s))
  }
}

const sendUpdate = s => {
  console.log('...sending update:')
  console.log(s)
  clientTokenUpdate = thingShadows.update('FatController', s)
  if (clientTokenUpdate === null) {
    console.log('update shadow failed, operation still in progress')
  } else {
    inflightOperations.add(clientTokenUpdate)
  }
}

const createDesiredState = s => {
  return {
    "state": {
      "desired": s
    }
  }
}

const createReportedState = s => {
  return {
    "state": {
      "reported": s
    }
  }
}

/* --- ACTIONS --- */
const setGateState = s => {
  if (gateState === s) return
  console.log(`${gateState} => ${s}`)
  gateState = s
  update({gateState})
}

const setSensorState = s => {
  if (sensorState === s) return
  console.log(`${sensorState} => ${s}`)
  sensorState = s
  update({sensorState})
}

/* --- STATE --- */
let gateState = OPEN 
let sensorState = NONE
let pulseWidth = upPulseWidth
let timer

/* --- TASKS --- */
const openGates = () => {
  clearInterval(timer)
  timer = setInterval(() => {
    if (pulseWidth <= upPulseWidth) {
      setGateState(OPEN)
      clearInterval(timer)
    } else {
      setGateState(OPENING)
      pulseWidth -= increment
      motor.servoWrite(pulseWidth)
    }
  }, interval)
}
 
const closeGates = () => {
  clearInterval(timer)
  timer = setInterval(() => {
    if (pulseWidth >= downPulseWidth) {
      setGateState(CLOSED)
      clearInterval(timer)
    } else {
      setGateState(CLOSING)
      pulseWidth += increment
      motor.servoWrite(pulseWidth)
    }
  }, interval)
}

/* --- INPUTS --- */
sensor1.on('alert', (level) => {
  update({sensor1: level ? 'off' : 'on'})
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

sensor2.on('alert', (level) => {
  update({sensor2: level ? 'off' : 'on'})
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

/* --- AWS Pub/Sub --- */
thingShadows.on('connect', () => {
  thingShadows.subscribe('override')
  thingShadows.register('FatController', {}, () => {
    const initialState = createReportedState({gateState: gateState, sensorState: sensorState})
    thingShadows.update('FatController', initialState)
  })
})

thingShadows.on('status', (thingName, stat, clientToken, stateObject) => {
  inflightOperations.delete(clientToken)
  console.log(`Message sent successfully. ${messageQueue.length} left to send`)
  if (messageQueue.length > 0) {
    const nextUpdate = messageQueue.shift()
    sendUpdate(nextUpdate)
  }
})

thingShadows.on('message', (topic, jsonPayload) => {
  let payload = JSON.parse(jsonPayload.toString())

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

thingShadows.on('delta', (thingName, stateObject) => {
  newGateState = stateObject && stateObject.state && stateObject.state.gateState
  console.log(`New desired state: ${newGateState}`)
  sendUpdate(createDesiredState({gateState: null}))
  switch (newGateState) {
    case 'open': openGates(); break
    case 'closed': closeGates(); break
  }
})
