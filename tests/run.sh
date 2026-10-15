#!/bin/sh
# Esegue tutti i test con il motore JavaScript già presente nel Mac (nessuna installazione).
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
export TZ=Europe/Rome
CORE="js/time.js js/scheduler.js js/parser.js js/areas.js js/stats.js js/store.js js/routines.js js/proposals.js js/assistant.js js/demo.js"
"$JSC" $CORE tests/tests.js || exit 1
"$JSC" $CORE tests/proposals-tests.js || exit 1
"$JSC" $CORE tests/ui-smoke.js || exit 1
echo "TUTTI I TEST SUPERATI"
