#!/usr/bin/env node
const express = require('express');
const app = require('express')();
const server = require('http').createServer(app);                         // for getting IP dynamically in index.ejs
const io = require('socket.io')(server);                                  // for getting IP dynamically in index.ejs
const path = require('path');
const { version } = require('./package.json');                            // get version number from package.json
const Logger = require('./logger');
const config = require('config-yml');

const DaumUSB = require('./USB/daumUSB');
const DaumSIM = require('./daumSIM');
const DaumBLE = config.mock.BLE ? require('./mock/daumBLE') : require('./BLE/daumBLE');

var dataToSend = null;

const logger = new Logger('server.js');

// init global variables
global.globalspeed_daum = config.globals.speed_daum;
global.globalrpm_daum = config.globals.rpm_daum;
global.globalgear_daum = config.globals.gear_daum;
global.globalpower_daum = config.globals.power_daum;
global.globalsimpower_daum = config.globals.simpower_daum;
global.globalpower_last = config.globals.power_daum; // last transmitted power value sent to bike/lyps
global.globalwindspeed_ble = config.globals.windspeed_ble;
global.globalgrade_ble = config.globals.grade_ble;
global.globalcrr_ble = config.globals.crr_ble;    // set once to have simulation available without BLE connected to apps
global.globalcw_ble = config.globals.cw_ble;      // set once to have simulation available without BLE connected to apps
global.globalmode = config.globals.mode;          // set this as default start mode here; in this mode ,ergoFACE is going to startup
global.globalswitch = config.globals.switch;      // set this as default start mode here; in this mode ,ergoFACE is going to startup



// server path specifications
app.use('/public/css', express.static(path.join(__dirname, 'public/css')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'lib')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.get('/', function (req, res) {
  res.render('index')
});

// start server listening on specified port
server.listen(process.env.PORT || config.server.port, function () {
  // for getting IP dynamicaly in index.ejs and not to enter it manually
  logger.debug('listening on port 3000!');
});

// instantiation of necessary modules
const daumUSB = new DaumUSB();
const daumSIM = new DaumSIM();
const daumBLE = new DaumBLE(serverCallback);
const daumUSBEventListener = daumUSB.open();

process.on('SIGINT', () => {
  logger.debug('detected SIGINT: initiate shutdown...');
  daumUSB.stop();
  server.close();
  process.exit();
});

// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, not from Daum or BLE
// /////////////////////////////////////////////////////////////////////////
io.on('connection', socket => {
  logger.info('connected to socketio');

  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - ergoFACE Server started');
  });

  socket.on('restart', function (data) {
    logger.info('restart');
    geargpio = 1;
    daumUSB.setGear(geargpio);
    setTimeout(daumUSB.restart, 1000);
    io.emit('key', '[server.js] - restart');
  });

  socket.on('stop', function (data) {
    logger.info('stop');
    daumUSB.stop();
    io.emit('key', '[server.js] - stop');
  });

  socket.on('setProgram', function (data) {
    logger.info('set Program');
    const programID = data;
    daumUSB.setProgram(programID);
    io.emit('key', '[server.js] - set Program ID: ' + programID);
  });

  /*socket.on('shiftGear', function (data) {
    // via webserver - set gears - !!!this is in conflict with gpio gear changing, because no read of gears when using gpios
    // NOTE: by changing the gear here, the cockpit switches to gear mode (jog wheel switches only gears from that time)
    let gear = global.globalgear_daum;
    logger.info(`shift gear (current gear: ${gear}`);

    switch (data) {
      case 'minus_minus':
        gear = gear - config.daumRanges.max_shift >= config.daumRanges.min_gear ? gear - config.daumRanges.max_shift : config.daumRanges.min_gear;
        break;
      case 'minus':
        gear = gear - 1 >= config.daumRanges.min_gear ? gear - 1 : config.daumRanges.min_gear;
        break;
      case 'plus_plus':
        gear = gear + config.daumRanges.max_shift <= config.daumRanges.max_gear ? gear + config.daumRanges.max_shift : config.daumRanges.max_gear;
        break;
      case 'plus':
        gear = gear + 1 <= config.daumRanges.max_gear ? gear + 1 : config.daumRanges.max_gear;
        break;
      default:
        logger.warn('set Gear can not be processed (setting last known gear)');
    }

    daumUSB.setGear(gear);
    io.emit('raw', '[server.js] - set Gear: ' + gear);
  }); */

  socket.on('shiftPower', function (data) {
    let power = Math.round(global.globalpower_daum / config.daumRanges.power_factor);
    logger.info(`shift power (current power: ${power * config.daumRanges.power_factor} Watt)`);

    switch (data) {
      case 'minus_minus':
        power = power - config.daumRanges.max_shift;
        break;
      case 'minus':
        power = power - config.daumRanges.min_shift;
        break;
      case 'plus_plus':
        power = power + config.daumRanges.max_shift;
        break;
      case 'plus':
        power = power + config.daumRanges.min_shift;
        break;
      default:
        logger.warn('set Power can not be processed (setting last known power)');
    }

    power = power * config.daumRanges.power_factor;
    logger.info(`set power to: ${power} Watt`);
    daumUSB.setPower(power);
    io.emit('raw', `[server.js] - set Power to ${power} Watt`);
  });

  /*socket.on('setGear', function (data) {
    // via webserver - set gears - !!!this is in conflict with gpio gear changing, because no read of gears when using gpios
    // NOTE: by changing the gear here, the cockpit switches to gear mode (jog wheel switches only gears from that time)
    logger.info('set Gear');
    const gear = data;
    daumUSB.setGear(gear);
    io.emit('raw', '[server.js] - set Gear: ' + gear);
  }); */

  socket.on('mode', function (data) { 
    // via webserver - switch mode ERG / SIM
    logger.info('switch mode');
    global.globalmode = data;
    const mode = data;
    io.emit('key', '[server.js] - switch mode: ' + mode);
  });
  
  socket.on('switch', function (data) { 
    // via webserver - switch Power / Gear shifting
    logger.info('switch');
    global.globalswitch = data;
    // const switchpg = data
    io.emit('key', '[server.js] - switch: ' + global.globalswitch);
  });
});

// /////////////////////////////////////////////////////////////////////////
// shifting gears or power via gpio + hardware switches
// /////////////////////////////////////////////////////////////////////////
let geargpio = config.gpio.geargpio;         // initialize to start from first gear
const ratio = config.globals.ratio;          // set ratio, to shift multiple gears with the press of a button.
const minGear = config.globals.minGear;      // lowest gear
const maxGear = config.globals.maxGear;      // highest gear

// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////
var connectedCount = 0;

daumBLE.on('key', string => {
  logger.debug('error: ' + string);
  io.emit('key', '[server.js] - ' + string);
});

daumBLE.on('error', string => {
  logger.debug('error: ' + string);
  io.emit('error', '[server.js] - ' + string);
});

daumBLE.on('accept', (client) => {
	connectedCount++;
	//oled.displayBLE('Connected');
  if (connectedCount > 0) {
    dataToSend = { 
      rpm: global.globalrpm_daum, 
      power: global.globalpower_daum,
      speed: global.globalspeed_daum
    };
    daumBLE.notifyFTMS(dataToSend);
    fillInTimer = setTimeout(sendFillInData, 800);
  }
});

function sendFillInData() {
	if (!dataToSend || (connectedCount < 1)) {
		console.log("Aborting nothing to send");
	}
  dataToSend = { 
    rpm: global.globalrpm_daum, 
    power: global.globalpower_daum,
    speed: global.globalspeed_daum
  };
	console.log("Sending fill in data" + JSON.stringify(dataToSend));
	daumBLE.notifyFTMS(dataToSend);
	fillInTimer = setTimeout(sendFillInData, 800);
}

daumBLE.on('disconnect', (client) => {
	connectedCount--;
  if(connectedCount < 0) {
    connectedCount = 0;
  }
  if (fillInTimer) {
    clearTimeout(fillInTimer);
    fillInTimer = null;
  }
	//oled.displayBLE('Disconnected');
});

daumUSBEventListener.on('error', string => {
  io.emit('error', '[server.js] - ' + string);
});

daumUSBEventListener.on('key', string => {
  io.emit('key', '[server.js] - ' + string);
});

daumUSBEventListener.on('raw', string => {
  io.emit('raw', string.toString('hex'));
  
  // emit version number to webserver
  io.emit('version', version);
});

daumUSBEventListener.on('data', data => {
  // get runData from daumUSB
  
  logger.info('data:' + JSON.stringify(data));

  if ('speed' in data) io.emit('speed', data.speed);
  if ('power' in data) io.emit('power', data.power);
  if ('rpm' in data) io.emit('rpm', data.rpm);
  if ('gear' in data) io.emit('gear', data.gear);
  if ('program' in data) io.emit('program', data.program);

  daumBLE.notifyFTMS(data);
});

// /////////////////////////////////////////////////////////////////////////
// BLE callback section
// /////////////////////////////////////////////////////////////////////////
function serverCallback (message, ...args) {
  let success = false;

  switch (message) {
    case 'reset':
      logger.debug('USB Reset triggered via BLE');
      io.emit('key', '[server.js] - Reset triggered via BLE');
      daumUSB.restart();
      success = true;
      break;

    case 'control':
      // do nothing special
      logger.debug('Bike under control via BLE');
      io.emit('key', '[server.js] - Bike under control via BLE');
      io.emit('control', 'BIKE CONTROLLED');
      success = true;
      break;

    case 'power':
      // ERG Mode - receive control point value via BLE from zwift or other app
      if (global.globalmode !== 'ERG') {
        logger.debug('Bike ERG Mode'); // daywalkers additions: to put that once in the logs is sufficient
      }
      if (args.length > 0) {
        const watt = args[0];
        daumUSB.setPower(watt);
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt);
        io.emit('control', 'ERG MODE');
        success = true;
      }
      break;

    case 'simulation': 
      // SIM Mode - calculate power based on physics
      if (global.globalmode !== 'SIM') {
        logger.debug('Bike in SIM Mode');
      }
      const windspeed = Number(args[0]).toFixed(1);
      const grade = Number(args[1]).toFixed(1);
      const crr = Number(args[2]).toFixed(4);
      const cw = Number(args[3]).toFixed(2);

      global.globalwindspeed_ble = windspeed;
      global.globalgrade_ble = grade;
      global.globalcrr_ble = crr;
      global.globalcw_ble = cw;

      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw);
      io.emit('windspeed', windspeed);
      io.emit('grade', grade);
      io.emit('crr', crr);
      io.emit('cw', cw);

      daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum);
      const power = Number(global.globalsimpower_daum).toFixed(0);

      daumUSB.setPower(power) // --> glaub ich nicht --> if this is used here, then some random power is transmitted to zwift, e.g.: 111 watts / 20sec

      io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power);
      io.emit('simpower', power);
      io.emit('control', 'SIM MODE');
      success = true;
      break;
  }
  return success;
}
