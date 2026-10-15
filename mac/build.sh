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
# firma locale (necessaria per i permessi di macOS)
codesign --force --deep --sign - "$OUT"
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Daily Schedule.app"
cp -R "$OUT" "$HOME/Applications/"
echo "Installata in ~/Applications/Daily Schedule.app"
