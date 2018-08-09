# FatController
![Fat Controller](https://pbs.twimg.com/profile_images/994663097095852033/SPDc-f3r_400x400.jpg)

NodeJS app to control boom gates, using [these micro servo motors](https://www.jaycar.com.au/arduino-compatible-9g-micro-servo-motor/p/YM2758) using some kind of sensors. I used blue LEDs facing [these LDRs](https://www.jaycar.com.au/arduino-compatible-photosensitive-ldr-sensor-module/p/XC4446), which is basically just an LDR and a resistory into the GPIO port. 

There are two sensors, on GPIO pins 4 and 17, with pin 18 controlling the servo PWM output. 
