# gcp-api

Somewhat proprietry API for communicating with Dynamics GP and Chemwatch.

Installation  
`npm install`

To run locally  
`npm run dev`


Create a .env file with the following:

DB_SERVER="Dynamics GP db server"  
DB_DATABASE="Dynamics GP db name"  
DB_USERNAME="Dynamics GP db user"  
DB_PASSWORD="Dynamics GP db password"  
PALLET_KEY_BCRYPT_HASH="Hash to compare pallet updater key to. This is used by Power Automate."  
CHEMICAL_LIST_BCRYPT_HASH="Hash to compare url key to. This is used on the QR code chemical list."  
TARGET_DIR="Smartconnect folder for creating ITTs in GP."  
CW_DOMAIN="Chemwatch domain"  
CW_USERNAME="Chemwatch username"  
CW_PASSWORD="Chemwatch password"  
