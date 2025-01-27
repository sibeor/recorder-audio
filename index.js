let fs = require('fs')
const path = require('path')
const { exec } = require('child_process');
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
function resurrectPM2() {
    exec('pm2 resurrect', (error, stdout, stderr) => {
        if (error) {
            console.error(`Eroare la rularea comenzii: ${error}`);
            return;
        }
        console.log(`Rezultatul comenzii: ${stdout}`);
        if (stderr) {
            console.error(`Erori: ${stderr}`);
        }
    });
}
function getCurrentDate(){
  const currentDate = new Date();
  
  const year = currentDate.getFullYear(); // Obține anul
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate
}

async function sendResultToServer (success, fileName, fileSizeInBytes = 0) {
  try {
    
    const data = { success: success, fileName: fileName, fileSize: fileSizeInBytes } // Poți modifica acest obiect pentru a transmite orice altă informație
    
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
  frames = []
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
  // isSaving = false
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

let isInterrupted = false
let isSaving = false
app.set('env', 'development')
app.put('/start-recording/:fileName', async (req, res) => {
  console.log('------------------------------------------------------------ start-recording ------------------------------------------------------------')
  console.log(getTimeString())
  console.log('recorder.isRecording0000:' + recorder.isRecording)
  console.log('isRecording:' + isRecording)
  try {
    await waitForSaveCompletion()
    let cnt = 0
    while ((recorder.isRecording || isRecording) && cnt < 6) {
      cnt++
      await waitForSomeSeconds(5)
      if (cnt >= 5) {
        isInterrupted = true
        await waitForSomeSeconds(1)
        recorder.stop()
        await waitForSomeSeconds(2)
        console.log('!!!Eroare la /start-recording')
        resetToDefaultValues()
      }
    }
    const folderPath = path.join(__dirname, 'recorders/' +  getCurrentDate());
    fileName = req.params.fileName
    if (!fileName) {
      res.sendStatus(404)
      return
    }
    outputPaths = []
    fs.mkdirSync(folderPath, { recursive: true });
    outputWavPath = 'recorders/' + getCurrentDate() +'/' + fileName + '.wav'
    // console.log('recorder.isRecording === FALSE')
    // console.log(recorder.isRecording)
     outputPaths.push(outputWavPath)
    // console.log(outputPaths)
    
    console.log('recorder.isRecording--2-->')
    console.log(recorder.isRecording)
    await waitForSomeSeconds(2)
    await recorder.start()
    await waitForSomeSeconds(1)
    isRecording = true
  } catch (e) {
    isInterrupted = true
    await waitForSomeSeconds(1)
    recorder.stop()
    resetToDefaultValues()
    console.log(e)
    console.log('Eroare la Începerea înregistrării.')
    console.log('************* resurrectPM2 *************')
    resurrectPM2()
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
  // FIXME: Dev/prod change to 10/200
  while (isSaving && iter < 200) {
    iter++
    console.log('Waiting...')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
function getTimeString(){
  const now = new Date();
  return `<<${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}>>`
}

app.put('/stop-recording', async (req, res) => {
  console.log('------------------------------------------------------------ stop-recording ------------------------------------------------------------')
  console.log(getTimeString())
  isSaving = true
  // FIXME: For PROD delete next line
  // await waitForSomeSeconds(10)
  res.sendStatus(200)
  
  try {
    isInterrupted = true
    await waitForSomeSeconds(1)
    recorder.stop()
    outputWavPath = outputPaths.shift()
    console.log(getTimeString())
    console.log('outputWavPath : ' + outputWavPath)
    console.log('fileName : ' + fileName)
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
      let fileSizeInBytes
      try {
        const fileStats = fs.statSync(outputWavPath)
        fileSizeInBytes = fileStats?.size
      } catch (e) {
        fileSizeInBytes = -1
      }
      console.log(fileSizeInBytes)
      await waitForSomeSeconds(2)
      await sendResultToServer(true, outputWavPath, fileSizeInBytes)
    } else {
      await sendResultToServer(false, outputWavPath)
      console.log('OCUPAT')
    }
  } catch (e) {
    // res.send('Eroare la Oprirea înregistrării...')
    console.log(getTimeString())
    console.log(e)
    let cnt2 = 0
    while (recorder.isRecording && cnt2 < 11) {
        cnt2++
       await waitForSomeSeconds(2)
    }
    await sendResultToServer(false, outputWavPath)
    isRecording = false
    recorder.release()
    resetToDefaultValues()
  } finally {
    isSaving = false
  }
  let cnt3 = 0
  while (recorder.isRecording && cnt3 < 11) {
    cnt3++
    // await waitForSomeSeconds(2)
  }
  // recorder.stop()
  console.log('FINAL STATUS ______________________________________________________')
  console.log('IS_RECORDING?')
  console.log(recorder.isRecording)
  // recorder.release()
  
  isSaving = false
  resetToDefaultValues()
  
  // res.send('Oprirea înregistrării...')
})
app.listen(port, () => {
  console.log(`Serverul ascultă pe http://localhost:${port}`)
})