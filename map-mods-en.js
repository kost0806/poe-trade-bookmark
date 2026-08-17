/**
 * T16(top tier) 지도 모드 목록 — 영문 전용. 한글판은 `map-mods.js`.
 *
 * 두 목록은 같은 모드를 같은 순서로 담고, ids도 같다(`test/map-mods-en.test.js`가
 * 대조한다). 다른 것은 문구·접두어 이름·키워드뿐이다.
 *
 * 만든 방법:
 *  - 문구/이름: `tools/build-en-data.js` (poedb 영문 표 + awakened-poe-trade 대조)
 *  - 키워드:    `tools/build-map-mods-en.js` (그 모드에만 걸리는 최단 문자열)
 *
 * 손으로 고치지 말고 스크립트를 고쳐 다시 만든다. 키워드 하나를 바꾸면 다른 모드와
 * 겹치는지 전부 다시 봐야 하는데, 그 검사는 `test/map-mods-en.test.js`에 있다.
 *
 * regex 값은 '이 모드에만 매칭되는 부분문자열'이다. 공백은 .으로 쓰고(인게임에서
 * 공백은 항목을 나눈다), 굴림마다 바뀌는 숫자는 넣지 않는다.
 */
const MAP_MODS_EN = [
  { ids: ["implicit.stat_804187877"], regex: "Monsters.drop", group: "Misc", affix: "MapCorruptionBossCorruption", text: "Unique Monsters drop Corrupted Items" },
  { ids: ["explicit.stat_4103440490"], regex: "with.Enfeeble", group: "Misc", affix: "of Enfeeblement", text: "Players are Cursed with Enfeeble" },
  { ids: ["explicit.stat_2326202293"], regex: "with.Temporal", group: "Misc", affix: "of Temporal Chains", text: "Players are Cursed with Temporal Chains" },
  { ids: ["explicit.stat_558910024"], regex: "with.Elemental", group: "Misc", affix: "of Elemental Weakness", text: "Players are Cursed with Elemental Weakness" },
  { ids: ["explicit.stat_1366534040"], regex: "with.Vulnerability", group: "Misc", affix: "of Vulnerability", text: "Players are Cursed with Vulnerability" },
  { ids: ["explicit.stat_1217583941"], regex: "expire", group: "Misc", affix: "of Transience", text: "Buffs on Players expire 70% faster" },
  { ids: ["explicit.stat_272758639","explicit.stat_3729221884"], regex: "to.Block", group: "Misc", affix: "of Rust", text: "Players have 30% less Armour\nPlayers have 40% reduced Chance to Block" },
  { ids: ["explicit.stat_2312028586"], regex: "less.Area", group: "Misc", affix: "of Impotence", text: "Players have 25% less Area of Effect" },
  { ids: ["explicit.stat_816367946"], regex: "always", group: "Monster buffs", affix: "Conflagrating", text: "All Monster Damage from Hits always Ignites" },
  { ids: ["explicit.stat_1106651798","explicit.stat_798009319"], regex: "Action", group: "Monster buffs", affix: "Unstoppable", text: "Monsters cannot be Taunted\nMonsters' Action Speed cannot be modified to below Base Value\nMonsters' Movement Speed cannot be modified to below Base Value" },
  { ids: ["explicit.stat_1890519597"], regex: "increased.Monster.Damage", group: "Monster buffs", affix: "Savage", text: "(22—25)% increased Monster Damage" },
  { ids: ["explicit.stat_3448216135"], regex: "as.Cold", group: "Monster buffs", affix: "Freezing", text: "Monsters deal (90—110)% extra Physical Damage as Cold" },
  { ids: ["explicit.stat_3416853625"], regex: "as.Lightning", group: "Monster buffs", affix: "Shocking", text: "Monsters deal (90—110)% extra Physical Damage as Lightning" },
  { ids: ["explicit.stat_1497673356"], regex: "as.Fire", group: "Monster buffs", affix: "Burning", text: "Monsters deal (90—110)% extra Physical Damage as Fire" },
  { ids: ["explicit.stat_144665660"], regex: "Bleeding", group: "Monster buffs", affix: "Impervious", text: "Monsters have a 50% chance to avoid Poison, Impale, and Bleeding" },
  { ids: ["explicit.stat_322206271"], regex: "Ailments", group: "Monster buffs", affix: "of Insulation", text: "Monsters have 70% chance to Avoid Elemental Ailments" },
  { ids: ["explicit.stat_4164174520"], regex: "Maim.on", group: "Monster buffs", affix: "of Carnage", text: "Monsters Maim on Hit with Attacks" },
  { ids: ["explicit.stat_2553656203"], regex: "Freeze", group: "Monster buffs", affix: "Empowered", text: "Monsters have a 20% chance to Ignite, Freeze and Shock on Hit" },
  { ids: ["explicit.stat_1629869774"], regex: "Blind.on", group: "Monster buffs", affix: "of Blinding", text: "Monsters Blind on Hit" },
  { ids: ["explicit.stat_1840747977","explicit.stat_3044826007"], regex: "seconds", group: "Monster buffs", affix: "Profane", text: "Monsters gain (31—35)% of their Physical Damage as Extra Chaos Damage\nMonsters Inflict Withered for 2 seconds on Hit" },
  { ids: ["explicit.stat_4154059009"], regex: "are.Hexproof", group: "Monster buffs", affix: "Hexproof", text: "Monsters are Hexproof" },
  { ids: ["explicit.stat_2887760183"], regex: "Life.as", group: "Monster buffs", affix: "Buffered", text: "Monsters gain (40—49)% of Maximum Life as Extra Maximum Energy Shield" },
  { ids: ["explicit.stat_337935900"], regex: "Strikes", group: "Monster buffs", affix: "of Toughness", text: "Monsters take (36—40)% reduced Extra Damage from Critical Strikes" },
  { ids: ["explicit.stat_1309819744"], regex: "Projectiles", group: "Monster buffs", affix: "Splitting", text: "Monsters fire 2 additional Projectiles" },
  { ids: ["explicit.stat_3350803563"], regex: "Poison.on", group: "Monster buffs", affix: "of Venom", text: "Monsters Poison on Hit" },
  { ids: ["explicit.stat_1541224187"], regex: "Impale.on", group: "Monster buffs", affix: "Impaling", text: "Monsters' Attacks have 60% chance to Impale on Hit" },
  { ids: ["explicit.stat_839186746"], regex: "Reduction", group: "Monster buffs", affix: "Armoured", text: "+40% Monster Physical Damage Reduction" },
  { ids: ["explicit.stat_95249895","explicit.stat_1041951480"], regex: "Monster.Life", group: "Monster buffs", affix: "Unwavering", text: "(25—30)% more Monster Life\nMonsters cannot be Stunned\n(40—49)% more Monster Life" },
  { ids: ["explicit.stat_3183973644"], regex: "skills.Chain", group: "Monster buffs", affix: "Chaining", text: "Monsters' skills Chain 2 additional times" },
  { ids: ["explicit.stat_2306522833","explicit.stat_1913583994","explicit.stat_2488361432"], regex: "Attack.Speed", group: "Monster buffs", affix: "Fleet", text: "(25—30)% increased Monster Movement Speed\n(35—45)% increased Monster Attack Speed\n(35—45)% increased Monster Cast Speed" },
  { ids: ["explicit.stat_1588049749"], regex: "amount", group: "Monster buffs", affix: "of Miring", text: "Monsters have 50% increased Accuracy Rating\nPlayers have -20% to amount of Suppressed Spell Damage Prevented" },
  { ids: ["explicit.stat_962720646"], regex: "Hinder", group: "Monster buffs", affix: "of Impedance", text: "Monsters Hinder on Hit with Spells" },
  { ids: ["explicit.stat_2138205941"], regex: "to.Suppress", group: "Monster buffs", affix: "Oppressive", rec: true, text: "Monsters have +60% chance to Suppress Spell Damage" },
  { ids: ["explicit.stat_2753083623","explicit.stat_57326096"], regex: "Multiplier", group: "Monster buffs", affix: "of Deadliness", text: "Monsters have (360—400)% increased Critical Strike Chance\n+(41—45)% to Monster Critical Strike Multiplier" },
  { ids: ["explicit.stat_365540634","explicit.stat_1054098949"], regex: "Monster.Chaos", group: "Monster buffs", affix: "Resistant", text: "+25% Monster Chaos Resistance\n+40% Monster Elemental Resistances" },
  { ids: ["explicit.stat_1708461270"], regex: "have.*increased.Area", group: "Monster buffs", affix: "of Giants", text: "Monsters have 100% increased Area of Effect" },
  { ids: ["explicit.stat_3796523155"], regex: "Curses", group: "Player debuffs", affix: "Hexwarded", text: "60% less effect of Curses on Monsters" },
  { ids: ["explicit.stat_1026390635"], regex: "cannot.inflict", group: "Player debuffs", affix: "of Balance", text: "Players cannot inflict Exposure" },
  { ids: ["explicit.stat_2450628570"], regex: "Auras.from", group: "Player debuffs", affix: "of Doubt", text: "Players have 60% reduced effect of Non-Curse Auras from Skills" },
  { ids: ["explicit.stat_3376488707"], regex: "all.maximum", group: "Player debuffs", affix: "of Exposure", rec: true, text: "Players have (-12—-9)% to all maximum Resistances" },
  { ids: ["explicit.stat_3667574329"], regex: "less.Accuracy", group: "Player debuffs", affix: "of Imprecision", rec: true, text: "Players have 25% less Accuracy Rating" },
  { ids: ["explicit.stat_2588474575"], regex: "Possessed", group: "Boss buffs", affix: "Enthralled", text: "Unique Bosses are Possessed" },
  { ids: ["explicit.stat_124877078","explicit.stat_2109106920"], regex: "and.Cast", group: "Boss buffs", affix: "Overlord's", text: "Unique Boss deals 25% increased Damage\nUnique Boss has 30% increased Attack and Cast Speed" },
  { ids: ["explicit.stat_1959158336","explicit.stat_3040667106"], regex: "increased.Life", group: "Boss buffs", affix: "Titan's", text: "Unique Boss has 35% increased Life\nUnique Boss has 70% increased Area of Effect" },
  { ids: ["explicit.stat_799271621"], regex: "two.Unique", group: "Boss buffs", affix: "Twinned", text: "Area contains two Unique Bosses" },
  { ids: ["explicit.stat_1821565133"], regex: "Magic.Monsters", group: "Area composition", affix: "of Bloodlines", text: "(20—30)% increased Magic Monsters" },
  { ids: ["explicit.stat_3246076198"], regex: "Shocked", group: "Area composition", affix: "of Lightning", text: "Area has patches of Shocked Ground which increase Damage taken by 50%" },
  { ids: ["explicit.stat_1000591322"], regex: "Totems", group: "Area composition", affix: "Ceremonial", text: "Area contains many Totems" },
  { ids: ["explicit.stat_4198346809"], regex: "Animals", group: "Area composition", affix: "Feral", text: "Area is inhabited by Animals" },
  { ids: ["explicit.stat_3561450806"], regex: "variety", group: "Area composition", affix: "Multifarious", text: "Area has increased monster variety" },
  { ids: ["explicit.stat_3134632618"], regex: "Lunaris", group: "Area composition", affix: "Lunar", text: "Area is inhabited by Lunaris fanatics" },
  { ids: ["explicit.stat_25085466"], regex: "Witches", group: "Area composition", affix: "Slithering", text: "Area is inhabited by Sea Witches and their Spawn" },
  { ids: ["explicit.stat_2609768284","explicit.stat_728267040"], regex: "in.Area", group: "Area composition", affix: "Subterranean", text: "Area is inhabited by the Vaal\nFound Items have 10% chance to drop Corrupted in Area" },
  { ids: ["implicit.stat_1612402470"], regex: "Vessels", group: "Area composition", affix: "MapCorruptionVaalVessel", text: "Area contains 1 additional guarded Exquisite Vaal Vessels" },
  { ids: ["explicit.stat_2457517302"], regex: "Solaris", group: "Area composition", affix: "Solar", text: "Area is inhabited by Solaris fanatics" },
  { ids: ["explicit.stat_1948962470"], regex: "Consecrated", group: "Area composition", affix: "of Consecration", text: "Area has patches of Consecrated Ground" },
  { ids: ["explicit.stat_3916182167"], regex: "Demons", group: "Area composition", affix: "Demonic", text: "Area is inhabited by Demons" },
  { ids: ["explicit.stat_808491979"], regex: "by.Undead", group: "Area composition", affix: "Undead", text: "Area is inhabited by Undead" },
  { ids: ["explicit.stat_349586058"], regex: "Chilled", group: "Area composition", affix: "of Ice", text: "Area has patches of Chilled Ground" },
  { ids: ["explicit.stat_1813544255"], regex: "Goatmen", group: "Area composition", affix: "Capricious", text: "Area is inhabited by Goatmen" },
  { ids: ["explicit.stat_133340941"], regex: "of.Burning", group: "Area composition", affix: "of Flames", text: "Area has patches of Burning Ground" },
  { ids: ["explicit.stat_645841425"], regex: "ranged", group: "Area composition", affix: "Emanant", text: "Area is inhabited by ranged monsters" },
  { ids: ["explicit.stat_2651141461"], regex: "Humanoids", group: "Area composition", affix: "Bipedal", text: "Area is inhabited by Humanoids" },
  { ids: ["explicit.stat_4252630904"], regex: "Kitava", group: "Area composition", affix: "Feasting", text: "Area is inhabited by Cultists of Kitava" },
  { ids: ["explicit.stat_45546355"], regex: "Skeletons", group: "Area composition", affix: "Skeletal", text: "Area is inhabited by Skeletons" },
  { ids: ["explicit.stat_3516340048"], regex: "Ghosts", group: "Area composition", affix: "Haunting", text: "Area is inhabited by Ghosts" },
  { ids: ["explicit.stat_3577222856"], regex: "desecrated", group: "Area composition", affix: "of Desecration", text: "Area has patches of desecrated ground" },
  { ids: ["explicit.stat_2961018200"], regex: "Abominations", group: "Area composition", affix: "Abhorrent", text: "Area is inhabited by Abominations" },
  { ids: ["explicit.stat_3126771445"], regex: "number", group: "Area composition", affix: "Antagonist's", text: "(20—30)% increased number of Rare Monsters" },
  { ids: ["explicit.stat_3278889477"], regex: "have.Physical", group: "Reflect", affix: "Punishing", rec: true, text: "Rare Monsters have Physical Thorns reflecting 800 Physical Damage" },
  { ids: ["explicit.stat_3938822425"], regex: "have.Elemental", group: "Reflect", affix: "Mirrored", rec: true, text: "Rare Monsters have Elemental Thorns reflecting 1500 Elemental Damage" },
  { ids: ["explicit.stat_1742567045"], regex: "a.Frenzy", group: "Recovery denial", affix: "of Frenzy", text: "Monsters gain a Frenzy Charge on Hit" },
  { ids: ["explicit.stat_406353061"], regex: "a.Power", group: "Recovery denial", affix: "of Power", text: "Monsters gain a Power Charge on Hit" },
  { ids: ["explicit.stat_3222482040"], regex: "charges.on", group: "Recovery denial", affix: "of Enervation", text: "Monsters steal Power, Frenzy and Endurance charges on Hit" },
  { ids: ["explicit.stat_687813731"], regex: "an.Endurance", group: "Recovery denial", affix: "of Endurance", text: "Monsters gain an Endurance Charge on Hit" },
  { ids: ["explicit.stat_1140978125"], regex: "Leeched", group: "Recovery denial", affix: "of Congealment", rec: true, text: "Monsters cannot be Leeched from" },
  { ids: ["explicit.stat_1910157106"], regex: "Mana.or", group: "Recovery denial", affix: "of Stasis", rec: true, text: "Players cannot Regenerate Life, Mana or Energy Shield" },
  { ids: ["explicit.stat_4181072906"], regex: "of.Life", group: "Recovery denial", affix: "of Smothering", rec: true, text: "Players have 60% less Recovery Rate of Life and Energy Shield" },
  { ids: ["explicit.stat_941368244"], regex: "Cooldown", group: "Recovery denial", affix: "of Fatigue", rec: true, text: "Players have 40% less Cooldown Recovery Rate" },
  { ids: ["explicit.stat_2549889921"], regex: "Players.gain", group: "Recovery denial", affix: "of Drought", rec: true, text: "Players gain 50% reduced Flask Charges" },
];

const MOD_GROUPS_EN = ["Misc","Monster buffs","Player debuffs","Boss buffs","Area composition","Reflect","Recovery denial"];

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { MAP_MODS_EN, MOD_GROUPS_EN };
}
