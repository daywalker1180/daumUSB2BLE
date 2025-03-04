const Bleno = require('bleno');
const config = require('config-yml');
const Logger = require('../logger');

const logger = new Logger('fitness-machine-status-characteristic.js');

// Spec
// Status op code
const StatusOpCode = {
  reservedForFutureUse: 0x00,
  reset: 0x01,
  stoppedPausedUser: 0x02,
  stoppedPausedSyfety: 0x03,
  startedResumedUser: 0x04,
  targetSpeedChanged: 0x05,
  targetInclineChanged: 0x06,
  targetResistanceLevelChanged: 0x07,
  targetPowerChanged: 0x08,
  targetHeartRateChanged: 0x09,
  targetExpendedEnergyChanged: 0x0a,
  targetNumberStepsChanged: 0x0b,
  targetNumberStridesChanged: 0x0c,
  targetDistanceChanged: 0x0d,
  targetTrainingTimeChanged: 0x0e,
  indoorBikeSimulationParametersChanged: 0x12,
  wheelCircumferenceChanged: 0x13
};

class FitnessMachineStatusCharacteristic extends Bleno.Characteristic {
  constructor () {
    super({
      uuid: '2ADA',
      value: null,
      properties: ['notify']//,
      /*descriptors: [
        new Bleno.Descriptor({
          // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]*/
    });
    this._updateValueCallback = null;
  }

  onSubscribe (maxValueSize, updateValueCallback) {
    logger.debug('client subscribed');
    this._updateValueCallback = updateValueCallback;
    return this.RESULT_SUCCESS;
  }

  onUnsubscribe () {
    logger.debug('client unsubscribed');
    this._updateValueCallback = null;
    return this.RESULT_UNLIKELY_ERROR;
  }

  notify (event) {
    logger.debug('notify');
    const buffer = new Buffer.from(2);
    // speed + power + heart rate
    buffer.writeUInt8(StatusOpCode.startedResumedUser, 0);

    if (this._updateValueCallback) {
      this._updateValueCallback(buffer);
    } else {
      logger.debug('nobody is listening');
    }
    return this.RESULT_SUCCESS;
  }
}

module.exports = FitnessMachineStatusCharacteristic;
