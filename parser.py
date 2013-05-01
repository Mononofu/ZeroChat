import plistlib
import json

p = plistlib.readPlist("./static/img/emoticons/Emoticons.plist")

equivalents = {}

for emoticon, equivs in p["Emoticons"].iteritems():
  for equiv in equivs["Equivalents"]:
    equivalents[equiv] = {
      'path': "/static/img/emoticons/%s" % emoticon,
      'name': equivs["Name"]
    }


with open("./static/img/trollfaces/theme") as f:
  icons_started = False
  for line in f.read().split("\n"):
    if line == "[default]":
      icons_started = True
      continue
    if not icons_started:
      continue

    rage_line = line.split(" ")
    filename = rage_line[0]
    shortcuts = rage_line[1:]

    for shortcut in shortcuts:
      name = shortcut.replace("[", "").replace("]", "")
      equivalents[shortcut] = {
        'path': "/static/img/trollfaces/%s" % filename,
        'name': name
      }

print json.dumps(equivalents)
