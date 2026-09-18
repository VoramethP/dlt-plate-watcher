# -*- coding: utf-8 -*-
import json
SOURCES = [
  {"id": "sanook", "name": "Sanook Auto — ผลรวมเลขทะเบียนมงคล", "url": "https://www.sanook.com/auto/89383/"},
  {"id": "autospinn-sum", "name": "Autospinn — เลขทะเบียนรถมงคล 2568 (ผลรวม + ค่าตัวอักษร)", "url": "https://www.autospinn.com/2024/07/lucky-thai-plate-numbers-137706"},
  {"id": "autospinn-pair", "name": "Autospinn — เลขคู่ป้ายทะเบียนรถมีความหมายว่าอะไร", "url": "https://www.autospinn.com/2024/05/even-numbers-license-plate-136898"},
  {"id": "tqm", "name": "TQM — เปิดสูตรคำนวณเลขทะเบียนรถ", "url": "https://www.tqm.co.th/articles/หมีรักรถ/เปิดสูตรคำนวณเลขทะเบียนรถ"},
  {"id": "tabiendee", "name": "ทะเบียนดี ดอท คอม — ค่าตัวอักษรและความหมายผลรวม", "url": "https://www.tabiendee.com/article_01.php"},
  {"id": "berded", "name": "Berded — ความหมายคู่เลขมงคล (เลขศาสตร์เดียวกับเบอร์มือถือ)", "url": "https://www.berded.in.th/article-562.php"},
]
# ---- ค่าตัวอักษร: 3 แหล่งตรงกันทุกตัว ----
LETTERS = {1: "กดถทภฤ", 2: "ขบปงช", 3: "ตฑฒฆ", 4: "คธรญษ", 5: "ฉณฌนมหฮฎฬ", 6: "จลวอ", 7: "ซศส", 8: "ยผฝพฟ", 9: "ฏฐ"}
letterValues = {ch: v for v, chars in LETTERS.items() for ch in chars}
# ---- ผลรวม (รวมค่าตัวอักษร) ----
GRADES = {
  "sanook": {"ดีมาก": [2,4,5,6,9,14,15,19,23,24,36,41,42,45,46,50,51,54,55,56,59,63,64,65], "ดี": [20,32,40,44,69,79], "ไม่ดีนัก": [3,7,11,12,17,20,21,27,29,30,33,34,37,43,48]},
  "autospinn-sum": {"ดีมาก": [4,5,6,9,14,15,19,23,24,32,36,40,41,42,44,45,46,50,51,54]},
}
# sanook ใส่ 20 ทั้ง "ดี" และ "ไม่ดีนัก" → ขัดกันในแหล่งเดียว ตัดออกจาก "ดี" (เก็บฝั่งระวังไว้)
sumGrades = {}
for src, table in GRADES.items():
  for grade, sums in table.items():
    for s in sums:
      e = sumGrades.setdefault(str(s), {"grades": {}})
      e["grades"].setdefault(grade, []).append(src)
MEANINGS = {2: "ดาวจันทร์ เสน่ห์ อ่อนโยน", 4: "ดาวพุธ การค้า การเจรจา", 5: "ดาวพฤหัสบดี ปัญญา ความน่าเชื่อถือ", 6: "ดาวศุกร์ การเงิน ความรัก อุปถัมภ์", 9: "ดาวพระเกตุ คุ้มครอง แคล้วคลาด",
            14: "ผู้ยิ่งใหญ่ ประสบความสำเร็จสูง", 15: "ความสุนทรี เสน่ห์ มีคนช่วยเหลือ", 19: "ผู้เสวยสุข โชคดี", 24: "สมบูรณ์สุข", 36: "สื่อแห่งความรัก โชคดี", 42: "ดวงอุปถัมภ์ มีผู้ใหญ่ค้ำจุน"}
for s, m in MEANINGS.items(): sumGrades.setdefault(str(s), {"grades": {}})["meaning"] = m + " (tabiendee)"
# สรุปเกรดเดียวต่อผลรวม: เอาเกรดที่แหล่งเห็นตรงกันมากสุด · ถ้าเสมอให้เอียงไปทาง "ระวัง"
ORDER = ["ไม่ดีนัก", "ดี", "ดีมาก"]
for s, e in sumGrades.items():
  if e["grades"]:
    best = sorted(e["grades"].items(), key=lambda kv: (len(kv[1]), -ORDER.index(kv[0])), reverse=True)[0]
    e["grade"] = best[0]; e["sources"] = best[1]
    if len(e["grades"]) > 1: e["conflict"] = {g: srcs for g, srcs in e["grades"].items() if g != best[0]}
  del e["grades"]
# ---- คู่เลข: กลุ่มตามหมวดที่แหล่งใช้ (ไม่แต่งเอง) ----
def pairs(src, lst): return {p: [src] for p in lst}
def merge(*dicts):
  out = {}
  for d in dicts:
    for p, srcs in d.items(): out.setdefault(p, []).extend(x for x in srcs if x not in out.get(p, []))
  return dict(sorted(out.items()))
GROUPS = [
  {"emoji": "🛡️", "name": "แคล้วคลาดปลอดภัย", "pairSources": merge(
      pairs("autospinn-pair", ["15","51","55","49","94","95","59","99"]),
      pairs("tqm", ["15","49","51","55","59","94","95","99","35","53"]))},
  {"emoji": "💗", "name": "เมตตามหานิยม เสน่ห์ ค้าขายดี", "pairSources": merge(
      pairs("autospinn-pair", ["22","23","32","24","42","26","62","29","92","36","63"]),
      pairs("tqm", ["22","23","24","26","29","32","36","42","62","63","92"]),
      pairs("berded", ["22","23","24","26","32","36","42","62","63"]))},
  {"emoji": "👑", "name": "อำนาจบารมี ผู้ใหญ่อุปถัมภ์ ก้าวหน้า", "pairSources": merge(
      pairs("autospinn-pair", ["35","53","45","54","89","98"]),
      pairs("tqm", ["15","35","45","51","53","54","89","98","99"]),
      pairs("berded", ["15","51","35","53","45","54","89","98","19","91"]))},
  {"emoji": "💰", "name": "โชคลาภ การเงิน วาจาเรียกทรัพย์", "pairSources": merge(
      pairs("autospinn-pair", ["28","82","66"]),
      pairs("tqm", ["24","28","36","42","63","66","82"]),
      pairs("berded", ["28","82","56","65","46","64","14","41","69","96","78","87","55","59","95","99"]))},
  {"emoji": "⚠️", "name": "ตำราบอกว่าควรเลี่ยง", "kind": "avoid", "pairSources": merge(
      pairs("autospinn-pair", ["03","30","10","01","12","21","33","07","70","13","31","73","37","38","83","02","20","06","60","67","76","11","91","19","39","93","17","71","77"]),
      pairs("tqm", ["01","02","03","06","10","13","20","30","31","33","60","67","76","37","38","73","83","07","12","21","70"]))},
]
for g in GROUPS: g["pairs"] = list(g["pairSources"].keys())
doc = {
  "_อ่านก่อน": "ตารางเลขศาสตร์ทะเบียนรถ รวบรวมจากแหล่งเผยแพร่สาธารณะ 6 แหล่ง (ดู sources) เมื่อ 2026-09-18 · แต่ละรายการบอกว่ามาจากแหล่งไหนบ้าง · ยังคงเป็นความเชื่อ ไม่ใช่ข้อเท็จจริง · แก้ได้ทุกช่อง bot อ่านใหม่ทุกครั้ง",
  "sources": SOURCES,
  "method": "ผลรวม = เลขนำหมวด + ค่าตัวอักษรทั้งสองตัว + เลข 4 หลัก (ทุกแหล่งใช้วิธีนี้กับตารางผลรวมสองหลัก) · คู่เลข = เลขสองหลักที่ติดกันในเลข 4 หลัก เช่น 2456 → 24, 45, 56 · เลขหนึ่งเข้าได้หลายกลุ่ม",
  "includePrefix": True,
  "letterValues": letterValues,
  "_letterValues": "3 แหล่งตรงกันทุกตัว (autospinn-sum, tabiendee, tqm)",
  "sumGrades": dict(sorted(sumGrades.items(), key=lambda kv: int(kv[0]))),
  "_sumGrades": "grade = เกรดที่แหล่งเห็นตรงกันมากสุด · sources = แหล่งที่ให้เกรดนั้น · conflict = แหล่งที่ให้ต่างออกไป · sanook ใส่ 20 ทั้งดีและไม่ดี จึงถือเป็นขัดกัน",
  "groups": GROUPS,
  "_groups": "pairs = คู่เลขทั้งหมดของกลุ่ม · pairSources = คู่เลขไหนมาจากแหล่งไหน (ยิ่งหลายแหล่งยิ่งเห็นตรงกัน) · กลุ่ม kind=avoid คือคู่เลขที่ตำราบอกว่าควรเลี่ยง — bot จะเตือน ไม่ตัดออก",
}
json.dump(doc, open("numerology.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open("numerology.json", "a").write("\n")
print("groups:", [(g["name"], len(g["pairs"])) for g in GROUPS]); print("sums:", len(sumGrades))
