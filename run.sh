#!/bin/bash

APP_FOLDER="/c/recorder-audio"
PM2_FOLDER="/c/etc"

if [ ! -d "$PM2_FOLDER" ]; then
    echo "Folderul $PM2_FOLDER nu există. Îl creăm acum..."
    mkdir -p "$PM2_FOLDER"
    cd "$PM2_FOLDER" || exit
    npm i pm2
    echo "Instalarea s-a finalizat."
else
        # Verificăm dacă folderul este gol
    if [ -z "$(ls -A "$PM2_FOLDER")" ]; then
        echo "Folderul $PM2_FOLDER este gol. Îl ștergem acum..."
        rmdir "$PM2_FOLDER"
        echo "Folderul a fost șters."
        mkdir -p "$PM2_FOLDER"
        cd "$PM2_FOLDER" || exit
        npm i pm2
    else
        echo "Folderul $PM2_FOLDER nu este gol."
    fi
fi

if [ -d "$APP_FOLDER" ]; then
    cd "$APP_FOLDER" || exit
    git pull
    if pm2 status | grep -q "online"; then
        echo "PM2 rulează și toate procesele sunt online."
    else
        echo "PM2 nu rulează. Pornim PM2..."
        pm2 start index.js --instances 1
        pm2 save
        echo "Starea a fost salvată cu succes."
    fi
else
    cd /c || exit
    git clone https://github.com/sibeor/recorder-audio.git
    cd "$APP_FOLDER" || exit
    git config --global --add save.directory C:/recorder-audio
    cp .env.example .env
    npm install
    pm2 start index.js --instances 1
    pm2 save
fi
sleep 3
pm2 resurrect

echo "Operațiunea a fost finalizată."