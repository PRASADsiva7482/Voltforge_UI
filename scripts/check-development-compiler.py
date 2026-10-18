"""Probe the configured development compiler using synthetic firmware only."""
import json
import pathlib
import urllib.request
import yaml

root = pathlib.Path(__file__).resolve().parents[1]
config = next(yaml.safe_load_all((root.parent / 'Voltforge_BL/src/main/resources/application.yml').read_text(encoding='utf-8')))
assert config['spring']['profiles']['active'] == 'dev'
compiler = config['app']['simulation']['compiler']
assert compiler['mode'] == 'REMOTE', 'This probe supports the configured remote compiler only'
source = 'void setup() { Serial.begin(115200); Serial.println("VOLT_FORGE_AUDIT_NATIVE"); }\nvoid loop() { if (Serial.available()) { Serial.write(Serial.read()); } }'
request = urllib.request.Request(compiler['remote-url'], data=json.dumps({'sketch': source, 'board': 'uno'}).encode(), headers={'Content-Type':'application/json'})
try:
    with urllib.request.urlopen(request, timeout=compiler['timeout-seconds'] + 5) as response:
        result = json.load(response)
    output = root / 'test-results/playground'
    output.mkdir(parents=True, exist_ok=True)
    if result.get('hex'):
        (output / 'compiled-audit.hex').write_text(result['hex'], encoding='ascii')
        print('Development remote compiler verified: synthetic Uno firmware produced', len(result['hex']), 'HEX characters')
    else:
        print('Development remote compiler returned no firmware:', str(result.get('stderr', 'No diagnostics'))[:400])
        raise SystemExit(1)
except Exception as error:
    print('Development compiler probe failed:', type(error).__name__, str(error)[:250])
    raise SystemExit(1)
