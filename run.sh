#!/bin/bash

APP_FOLDER="/c/recorder-audio"
PM2_FOLDER="/c/etc"

if [ ! -d "$PM2_FOLDER" ]; then
    echo "Folderul $PM2_FOLDER nu există. Îl creăm acum..."
    mkdir -p "$PM2_FOLDER"
    cd "$PM2_FOLDER" || exit
    npm i pm2
    echo "Instalarea s-a finalizat."
fi

if [ -d "$APP_FOLDER" ]; then
    cd "$APP_FOLDER" || exit
    git pull
else
    cd /c
    git clone https://github.com/sibeor/recorder-audio.git
    cd "$APP_FOLDER" || exit
    cp .env.example .env
    npm install
    pm2 start index.js --instances 1
    pm2 save
fi

pm2 resurrect

echo "Operațiunea a fost finalizată."