node --max_old_space_size=16184 --require ts-node/register srcgenerateSpellsData.ts
../../../simc/casc_extract/WinGenerateSpellData.bat
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellName > SpellName.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellCooldowns > SpellCooldowns.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellDuration > SpellDuration.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellMisc > SpellMisc.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellCategory > SpellCategory.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellCategories > SpellCategories.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellCastTimes > SpellCastTimes.json
python dbc_extract.py -b 10.1.7.51754 -t json -p ..\casc_extract\wow\10.1.7.51754\DBFilesClient SpellEffect > SpellEffect.json
