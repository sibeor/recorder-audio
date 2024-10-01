let fs = require('fs')
const path = require('path')
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
function getCurrentDate(){
  const currentDate = new Date();
  
  // Obține anul, luna și ziua din obiectul Date
  const year = currentDate.getFullYear(); // Obține anul
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Obține luna (1-12) și adaugă zero în față dacă este necesar
  const day = String(currentDate.getDate()).padStart(2, '0'); // Obține ziua (1-31) și adaugă zero în față dacă este necesar
  
  // Formatează data în formatul YYYY-MM-DD
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate
}

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
  // let fileName = ''
  if (!wav) {
    wav = new WaveFile()
  }
  frames = []
  outputPaths = []
  audioDeviceIndex = parseInt(process?.env?.DEVICE_ID) || 0
  frameLength = 512
  if (!recorder) {
    console.log('Create new PvRecorder')
    recorder = new PvRecorder(frameLength, audioDeviceIndex)
  }
  if (!wav) {
    wav = new WaveFile()
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
console.log('DEVICE')
console.log(process?.env?.DEVICE_ID)
let audioDeviceIndex = parseInt(process?.env?.DEVICE_ID) || 0
let frameLength = 512
let recorder = new PvRecorder(frameLength, audioDeviceIndex)
recorder.setDebugLogging(true)
// console.log(`Using PvRecorder version: ${recorder.version}`)

let isInterrupted = false
let isSaving = false
app.put('/start-recording/:fileName', async (req, res) => {
  console.log('start-recording')
  console.log('recorder.isRecording0000:' + recorder.isRecording)
  console.log('isRecording:' + isRecording)
  try {
    await waitForSaveCompletion()
    fileName = req.params.fileName
    if (!fileName) {
      res.sendStatus(404)
      return
    }
    let cnt = 0
    while ((recorder.isRecording || isRecording) && cnt < 11) {
      cnt++
      await waitForSomeSeconds(5)
      if (cnt >= 10) {
        isInterrupted = true
        await recorder.stop()
        console.log('!!!Eroare la /start-recording')
        // recorder.release()
        resetToDefaultValues()
      }
    }
    const folderPath = path.join(__dirname, 'recorders/' +  getCurrentDate());
    fs.mkdirSync(folderPath, { recursive: true });
    outputWavPath = 'recorders/' + getCurrentDate() +'/' + fileName + '.wav'
    // console.log('recorder.isRecording === FALSE')
    // console.log(recorder.isRecording)
     outputPaths.push(outputWavPath)
    // console.log(outputPaths)
    
    console.log('recorder.isRecording--1-->')
    console.log(recorder.isRecording)
    if (recorder.isRecording) {
      await recorder.stop()
        // resetToDefaultValues()
    }
    console.log('recorder.isRecording--2-->')
    console.log(recorder.isRecording)
    await recorder.start()
    isRecording = true
  } catch (e) {
    // recorder.stop()
    
    isInterrupted = true
    recorder.stop()
    resetToDefaultValues()
    // res.send('Eroare la Începerea înregistrării...')
    console.log(e)
    console.log('Eroare la Începerea înregistrării.')
  }
  // res.send('Începerea înregistrării...')
  res.sendStatus(200)
  await readBuffer()
})

async function readBuffer () {
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

async function waitForSaveCompletion () {
  let iter = 0
  // FIXME: Dev/prod change to 10/100
  while (isSaving && iter < 10) {
    iter++
    console.log('Waiting...')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

app.put('/stop-recording', async (req, res) => {
  console.log('stop-recording')
  isSaving = true
  res.sendStatus(200)
  isInterrupted = true
  
  // async function wait3sec () {
  //   console.log("Așteaptă 3 secunde...");
  //   await new Promise(resolve => setTimeout(resolve, 3000));
  // }
  
  try {
    await waitForSomeSeconds(1)
    await recorder.stop()
    outputWavPath = outputPaths.shift()
    if (fileName && !!outputWavPath) {
      let audioData = new Int16Array(recorder.frameLength * frames.length)
      for (let i = 0; i < frames.length; i++) {
        audioData.set(frames[i], i * recorder.frameLength)
      }
      
      await wav.fromScratch(1, recorder.sampleRate, '16', audioData)
      await waitForSomeSeconds(4)
     
      console.log('outputPaths EMPTY: ')
      console.log(outputPaths)
      fs.writeFileSync(outputWavPath, wav.toBuffer())
      await sendResultToServer(true, outputWavPath)
    } else {
      await sendResultToServer(false, outputWavPath)
      console.log('OCUPAT')
    }
  } catch (e) {
    // res.send('Eroare la Oprirea înregistrării...')
    console.log(e)
    let cnt2 = 0
    while (recorder.isRecording && cnt2 < 11) {
        cnt2++
       await waitForSomeSeconds(2)
    }
    await sendResultToServer(false, outputWavPath)
    isRecording = false
    isInterrupted = true
    recorder.stop()
    resetToDefaultValues()
  } finally {
    isSaving = false
  }
  let cnt3 = 0
  while (recorder.isRecording && cnt3 < 11) {
    cnt3++
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