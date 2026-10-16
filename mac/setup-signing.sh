#!/bin/sh
# Crea (una volta sola) un certificato locale per firmare "Daily Schedule.app".
# Con una firma fissa, macOS ricorda i permessi di Calendario e Promemoria anche dopo gli aggiornamenti.
# Tutto resta in un portachiavi separato: ~/Library/Application Support/DailyScheduleBuild
set -e
DIR="$HOME/Library/Application Support/DailyScheduleBuild"
KC="$DIR/signing.keychain-db"
PASS="daily-schedule-build"
NAME="Daily Schedule Local"
mkdir -p "$DIR"
if [ -f "$KC" ]; then echo "Certificato già presente"; exit 0; fi
cd "$DIR"
cat > cert.cnf <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -config cert.cnf >/dev/null 2>&1
openssl pkcs12 -export -out id.p12 -inkey key.pem -in cert.pem -passout pass:$PASS -name "$NAME" >/dev/null 2>&1
security create-keychain -p "$PASS" "$KC"
security set-keychain-settings "$KC"   # niente blocco automatico
security unlock-keychain -p "$PASS" "$KC"
security import id.p12 -k "$KC" -P "$PASS" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KC" >/dev/null
rm -f key.pem id.p12 cert.cnf
echo "Certificato creato"
