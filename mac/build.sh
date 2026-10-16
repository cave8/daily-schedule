#!/bin/sh
# Costruisce "Daily Schedule.app" e la installa in ~/Applications (nessun permesso di amministratore).
set -e
cd "$(dirname "$0")"
OUT=build/"Daily Schedule.app"
rm -rf build && mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"
xcrun swiftc -O -target arm64-apple-macos14.0 -o "$OUT/Contents/MacOS/DailySchedule" Sources/main.swift \
  -framework Cocoa -framework WebKit -framework EventKit
cp Info.plist "$OUT/Contents/Info.plist"
# icona
ICONSET=build/AppIcon.iconset && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s ../icons/icon-512.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); [ $d -le 512 ] && sips -z $d $d ../icons/icon-512.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
cp ../icons/icon-512.png "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$OUT/Contents/Resources/AppIcon.icns"
# firma: con il certificato fisso (setup-signing.sh) macOS ricorda i permessi anche dopo gli aggiornamenti
KC="$HOME/Library/Application Support/DailyScheduleBuild/signing.keychain-db"
if [ -f "$KC" ]; then
  security unlock-keychain -p "daily-schedule-build" "$KC"
  HASH=$(security find-identity -p codesigning "$KC" | awk '/Daily Schedule Local/ {print $2; exit}')
  # il portachiavi dedicato entra nella lista solo per il tempo della firma, poi la lista torna com'era
  ORIG=$(security list-keychains -d user | tr -d '"')
  restore() { security list-keychains -d user -s $ORIG; }
  trap restore EXIT
  security list-keychains -d user -s $ORIG "$KC"
  codesign --force --deep --sign "$HASH" "$OUT"
  restore
  trap - EXIT
else
  codesign --force --deep --sign - "$OUT"
fi
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Daily Schedule.app"
cp -R "$OUT" "$HOME/Applications/"
echo "Installata in ~/Applications/Daily Schedule.app"
