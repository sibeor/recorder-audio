let fs = require('fs')
require('dotenv').config()
let { WaveFile } = require('wavefile')
let { PvRecorder } = require('@picovoice/pvrecorder-node')

const axios = require('axios')

let express = require('express')
let cors = require('cors')
let app = express()
let port = process?.env?.PORT || 3311

app.use(cors())

app.get('/', (req, res) => {
  // res.send('Salut de pe serverul Express.js!')
  res.sendStatus(200)
})

async function sendResultToServer (success, fileName) {
  try {
    const data = { success: success, fileName: fileName } // Poți modifica acest obiect pentru a transmite orice altă informație
    
    const crmBaseUrl = process?.env?.CRM_BASE_URL
    const crmUrl = crmBaseUrl + '/server/api/v3/qms/record_audio/status'
    const response = await axios.post(crmUrl, data)
    
    if (response.status === 200) {
      console.log('Mesajul a fost trimis cu succes către server.')
    } else {
      console.log('A intervenit o eroare la trimiterea mesajului către server.')
    }
  } catch (error) {
    console.log('A intervenit o eroare la trimiterea mesajului către server:', error.message)
  }
}

function resetToDefaultValues () {
  outputWavPath = ''
  let fileName = ''
  wav = new WaveFile()
  frames = []
  audioDeviceIndex = process?.env?.DEVICE_ID || 1
  frameLength = 512
  if (!recorder) {
    console.log('Create new PvRecorder')
    recorder = new PvRecorder(frameLength, audioDeviceIndex)
  }
  // recorder = new PvRecorder(frameLength, audioDeviceIndex)
  isInterrupted = false
  isRecording = false
}

let devices = PvRecorder.getAvailableDevices()
for (let i = 0; i < devices.length; i++) {
  console.log(`index: ${i}, device name: ${devices[i]}`)
}
let isRecording = false
let outputWavPath = ''
let outputPaths = []
let fileName = ''
let wav = new WaveFile()
let frames = []
let audioDeviceIndex = 1
let frameLength = 512
let recorder = new PvRecorder(frameLength, audioDeviceIndex)
// console.log(`Using PvRecorder version: ${recorder.version}`)

let isInterrupted = false
app.put('/start-recording/:fileName', async (req, res) => {
  console.log('start-recording')
  console.log('recorder.isRecording' + recorder.isRecording)
  console.log('isRecording' + isRecording)
  try {
    fileName = req.params.fileName
    if (!fileName) {
      res.sendStatus(404)
      return
    }
    let cnt = 0
    while ((recorder.isRecording || isRecording) && cnt < 11) {
      cnt++
      await waitForSomeSeconds(15)
      if (cnt >= 10) {
        console.log('Eroare la /start-recording')
      }
    }
    outputWavPath = 'recorders/' + fileName + '.wav'
    console.log('recorder.isRecording === FALSE')
    console.log(recorder.isRecording)
    console.log(outputWavPath)
    outputPaths.push(outputWavPath)
    
    recorder.start()
    isRecording = true
    console.log(`Using device: ${recorder.getSelectedDevice()}`)
  } catch (e) {
    // recorder.stop()
    // recorder.release()
    // res.send('Eroare la Începerea înregistrării...')
    console.log(e)
    console.log('Eroare la Începerea înregistrării.')
  }
  // res.send('Începerea înregistrării...')
  res.sendStatus(200)
  await readBuffer()
})

async function readBuffer () {
  let cnt = 0
  while (!isInterrupted) {
    let frame = await recorder.read()
    if (fileName) {
      frames.push(frame)
      // console.log(recorder.isRecording)
    }
  }
}

function waitForSomeSeconds (seconds = 1) {
  let milliseconds = seconds * 1000
  return new Promise(resolve => {
    console.log(`Așteaptă ${seconds} secunde...isRecording = `, recorder.isRecording)
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })
}

app.put('/stop-recording', async (req, res) => {
  console.log('stop-recording')
  res.sendStatus(200)
  isInterrupted = true
  
  // async function wait3sec () {
  //   console.log("Așteaptă 3 secunde...");
  //   await new Promise(resolve => setTimeout(resolve, 3000));
  // }
  
  try {
    await waitForSomeSeconds(1)
    await recorder.stop()
    if (fileName) {
      let audioData = new Int16Array(recorder.frameLength * frames.length)
      for (let i = 0; i < frames.length; i++) {
        audioData.set(frames[i], i * recorder.frameLength)
      }
      
      await wav.fromScratch(1, recorder.sampleRate, '16', audioData)
      await waitForSomeSeconds(4)
      outputWavPath = outputPaths.shift()
      console.log(outputWavPath)
      fs.writeFileSync(outputWavPath, wav.toBuffer())
      await sendResultToServer(true, outputWavPath)
    } else {
      await sendResultToServer(false, outputWavPath)
      console.log('OCUPAT')
    }
  } catch (e) {
    // res.send('Eroare la Oprirea înregistrării...')
    recorder.stop()
    // recorder.release()
    //  resetToDefaultValues()
    console.log(e)
    let cnt2 = 0
    while (recorder.isRecording && cnt2 < 11) {
       await waitForSomeSeconds(2)
    }
    await sendResultToServer(false, outputWavPath)
    isRecording = false
    resetToDefaultValues()
  }
  let cnt3 = 0
  while (recorder.isRecording && cnt3 < 11) {
    await waitForSomeSeconds(2)
  }
  // recorder.stop()
  console.log('FINAL STATUS ______________________________________________________')
  console.log('IS_RECORDING?')
  console.log(recorder.isRecording)
  // recorder.release()
  resetToDefaultValues()
  
  // res.send('Oprirea înregistrării...')
})
app.listen(port, () => {
  console.log(`Serverul ascultă pe http://localhost:${port}`)
})