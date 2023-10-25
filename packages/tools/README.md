# Generating new spell effects data

This document outlines how to generate the spellEffects.json file used by WAL for cooldown and duration information of spells

Note that this is currently only supported on the Windows platform.

## 1. Pull the simc repo

Pull the repo for simc at https://github.com/simulationcraft/simc

Checkout the branch associated with the current expansion

File paths will assume that you have pulled this repo in a sibling folder to wowarenalogs e.g.:

```
somepath/wowarenalogs/
somepath/simc/
```

## 2. Find the current game version

The easiest place is underneath the "PLAY" button on the bnet launcher. It should be in the format

XX.X.X.XXXXX

e.g:

10.1.7.51886

## 3. Run the database generation

This step will download the most recent spells databases for extraction.

Execute

```
/simc/casc_extract/WinGenerateSpellData.bat
```

This will take some time.

## 4. Run the python casc extractor

This will extract the spell information into JSON files for easier consumption.

Replace the game version string in tools/scripts/extract.bat with the most recent one you pulled from step (2)

Copy the python script into simc/dbc_extract3

Move to simc/dbc_extract3 as a working directory and execute extract.bat

This should generate a number of .json files in that folder.

## 5. Run the effects json parser

Assuming everything is in the correct folder, you can simply run

```
npm run start:generateSpellsData
```

and this will generate a brand new spellEffects.json file in the repo.
