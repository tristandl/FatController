const Gpio = require('pigpio').Gpio;
 
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

let state = NONE 
let pulseWidth = upPulseWidth
let timer

motor.servoWrite(upPulseWidth)

const openGates = () => {
	clearInterval(timer)
	timer = setInterval(() => {
		if (pulseWidth <= upPulseWidth) {
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
		state = NONE
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
		state = NONE
		openGates()
	} else if (!level && (state == NONE)) {
		state = TWO_TRIGGERED
		closeGates()
	}
	console.log(`... ${level}: ${state}`)
})
