import type { KanaCharacter } from './types'

// Full hiragana table with 3 colloquial example words per character.
// Words chosen to be common, modern, and useful for daily speech rather than
// textbook-formal vocabulary.
export const HIRAGANA: KanaCharacter[] = [
  { char: 'あ', romaji: 'a', kana: 'hiragana', words: [
    { jp: 'あした', romaji: 'ashita', meaning: 'tomorrow' },
    { jp: 'あめ', romaji: 'ame', meaning: 'rain' },
    { jp: 'ありがとう', romaji: 'arigatou', meaning: 'thanks' },
  ]},
  { char: 'い', romaji: 'i', kana: 'hiragana', words: [
    { jp: 'いぬ', romaji: 'inu', meaning: 'dog' },
    { jp: 'いま', romaji: 'ima', meaning: 'now' },
    { jp: 'いいよ', romaji: 'ii yo', meaning: 'sure / okay' },
  ]},
  { char: 'う', romaji: 'u', kana: 'hiragana', words: [
    { jp: 'うどん', romaji: 'udon', meaning: 'udon noodles' },
    { jp: 'うん', romaji: 'un', meaning: 'yeah' },
    { jp: 'うそ', romaji: 'uso', meaning: 'no way / lie' },
  ]},
  { char: 'え', romaji: 'e', kana: 'hiragana', words: [
    { jp: 'えき', romaji: 'eki', meaning: 'station' },
    { jp: 'えいが', romaji: 'eiga', meaning: 'movie' },
    { jp: 'えっ', romaji: 'e!', meaning: 'huh? / what?' },
  ]},
  { char: 'お', romaji: 'o', kana: 'hiragana', words: [
    { jp: 'おはよう', romaji: 'ohayou', meaning: 'morning!' },
    { jp: 'おかね', romaji: 'okane', meaning: 'money' },
    { jp: 'おいしい', romaji: 'oishii', meaning: 'delicious' },
  ]},

  { char: 'か', romaji: 'ka', kana: 'hiragana', words: [
    { jp: 'かわいい', romaji: 'kawaii', meaning: 'cute' },
    { jp: 'かばん', romaji: 'kaban', meaning: 'bag' },
    { jp: 'かぞく', romaji: 'kazoku', meaning: 'family' },
  ]},
  { char: 'き', romaji: 'ki', kana: 'hiragana', words: [
    { jp: 'きれい', romaji: 'kirei', meaning: 'pretty / clean' },
    { jp: 'きのう', romaji: 'kinou', meaning: 'yesterday' },
    { jp: 'きょう', romaji: 'kyou', meaning: 'today' },
  ]},
  { char: 'く', romaji: 'ku', kana: 'hiragana', words: [
    { jp: 'くるま', romaji: 'kuruma', meaning: 'car' },
    { jp: 'くつ', romaji: 'kutsu', meaning: 'shoes' },
    { jp: 'くち', romaji: 'kuchi', meaning: 'mouth' },
  ]},
  { char: 'け', romaji: 'ke', kana: 'hiragana', words: [
    { jp: 'けいたい', romaji: 'keitai', meaning: 'cell phone' },
    { jp: 'けさ', romaji: 'kesa', meaning: 'this morning' },
    { jp: 'けっこう', romaji: 'kekkou', meaning: 'pretty / quite' },
  ]},
  { char: 'こ', romaji: 'ko', kana: 'hiragana', words: [
    { jp: 'こんにちは', romaji: 'konnichiwa', meaning: 'hello' },
    { jp: 'こども', romaji: 'kodomo', meaning: 'kid' },
    { jp: 'ここ', romaji: 'koko', meaning: 'here' },
  ]},

  { char: 'さ', romaji: 'sa', kana: 'hiragana', words: [
    { jp: 'さくら', romaji: 'sakura', meaning: 'cherry blossom' },
    { jp: 'さかな', romaji: 'sakana', meaning: 'fish' },
    { jp: 'さむい', romaji: 'samui', meaning: 'cold' },
  ]},
  { char: 'し', romaji: 'shi', kana: 'hiragana', words: [
    { jp: 'しごと', romaji: 'shigoto', meaning: 'job / work' },
    { jp: 'しろ', romaji: 'shiro', meaning: 'white' },
    { jp: 'しんぱい', romaji: 'shinpai', meaning: 'worry' },
  ]},
  { char: 'す', romaji: 'su', kana: 'hiragana', words: [
    { jp: 'すき', romaji: 'suki', meaning: 'I like it' },
    { jp: 'すごい', romaji: 'sugoi', meaning: 'amazing / wow' },
    { jp: 'すし', romaji: 'sushi', meaning: 'sushi' },
  ]},
  { char: 'せ', romaji: 'se', kana: 'hiragana', words: [
    { jp: 'せんせい', romaji: 'sensei', meaning: 'teacher' },
    { jp: 'せまい', romaji: 'semai', meaning: 'cramped' },
    { jp: 'せかい', romaji: 'sekai', meaning: 'world' },
  ]},
  { char: 'そ', romaji: 'so', kana: 'hiragana', words: [
    { jp: 'そう', romaji: 'sou', meaning: 'right / so' },
    { jp: 'そら', romaji: 'sora', meaning: 'sky' },
    { jp: 'そと', romaji: 'soto', meaning: 'outside' },
  ]},

  { char: 'た', romaji: 'ta', kana: 'hiragana', words: [
    { jp: 'たのしい', romaji: 'tanoshii', meaning: 'fun' },
    { jp: 'たべる', romaji: 'taberu', meaning: 'to eat' },
    { jp: 'たかい', romaji: 'takai', meaning: 'expensive / tall' },
  ]},
  { char: 'ち', romaji: 'chi', kana: 'hiragana', words: [
    { jp: 'ちいさい', romaji: 'chiisai', meaning: 'small' },
    { jp: 'ちかい', romaji: 'chikai', meaning: 'close / near' },
    { jp: 'ちがう', romaji: 'chigau', meaning: 'wrong / different' },
  ]},
  { char: 'つ', romaji: 'tsu', kana: 'hiragana', words: [
    { jp: 'つかれた', romaji: 'tsukareta', meaning: 'I’m tired' },
    { jp: 'つよい', romaji: 'tsuyoi', meaning: 'strong' },
    { jp: 'つぎ', romaji: 'tsugi', meaning: 'next' },
  ]},
  { char: 'て', romaji: 'te', kana: 'hiragana', words: [
    { jp: 'てがみ', romaji: 'tegami', meaning: 'letter' },
    { jp: 'てんき', romaji: 'tenki', meaning: 'weather' },
    { jp: 'てつだう', romaji: 'tetsudau', meaning: 'to help' },
  ]},
  { char: 'と', romaji: 'to', kana: 'hiragana', words: [
    { jp: 'ともだち', romaji: 'tomodachi', meaning: 'friend' },
    { jp: 'とけい', romaji: 'tokei', meaning: 'clock / watch' },
    { jp: 'とおい', romaji: 'tooi', meaning: 'far' },
  ]},

  { char: 'な', romaji: 'na', kana: 'hiragana', words: [
    { jp: 'なまえ', romaji: 'namae', meaning: 'name' },
    { jp: 'なに', romaji: 'nani', meaning: 'what' },
    { jp: 'なつ', romaji: 'natsu', meaning: 'summer' },
  ]},
  { char: 'に', romaji: 'ni', kana: 'hiragana', words: [
    { jp: 'にほん', romaji: 'nihon', meaning: 'Japan' },
    { jp: 'にく', romaji: 'niku', meaning: 'meat' },
    { jp: 'にがい', romaji: 'nigai', meaning: 'bitter' },
  ]},
  { char: 'ぬ', romaji: 'nu', kana: 'hiragana', words: [
    { jp: 'いぬ', romaji: 'inu', meaning: 'dog' },
    { jp: 'ぬの', romaji: 'nuno', meaning: 'cloth' },
    { jp: 'ぬるい', romaji: 'nurui', meaning: 'lukewarm' },
  ]},
  { char: 'ね', romaji: 'ne', kana: 'hiragana', words: [
    { jp: 'ねこ', romaji: 'neko', meaning: 'cat' },
    { jp: 'ねむい', romaji: 'nemui', meaning: 'sleepy' },
    { jp: 'ねだん', romaji: 'nedan', meaning: 'price' },
  ]},
  { char: 'の', romaji: 'no', kana: 'hiragana', words: [
    { jp: 'のむ', romaji: 'nomu', meaning: 'to drink' },
    { jp: 'のる', romaji: 'noru', meaning: 'to ride' },
    { jp: 'のんびり', romaji: 'nonbiri', meaning: 'leisurely' },
  ]},

  { char: 'は', romaji: 'ha', kana: 'hiragana', words: [
    { jp: 'はな', romaji: 'hana', meaning: 'flower / nose' },
    { jp: 'はやい', romaji: 'hayai', meaning: 'fast / early' },
    { jp: 'はい', romaji: 'hai', meaning: 'yes' },
  ]},
  { char: 'ひ', romaji: 'hi', kana: 'hiragana', words: [
    { jp: 'ひと', romaji: 'hito', meaning: 'person' },
    { jp: 'ひる', romaji: 'hiru', meaning: 'noon / daytime' },
    { jp: 'ひさしぶり', romaji: 'hisashiburi', meaning: 'long time no see' },
  ]},
  { char: 'ふ', romaji: 'fu', kana: 'hiragana', words: [
    { jp: 'ふゆ', romaji: 'fuyu', meaning: 'winter' },
    { jp: 'ふるい', romaji: 'furui', meaning: 'old' },
    { jp: 'ふつう', romaji: 'futsuu', meaning: 'usual / normal' },
  ]},
  { char: 'へ', romaji: 'he', kana: 'hiragana', words: [
    { jp: 'へや', romaji: 'heya', meaning: 'room' },
    { jp: 'へん', romaji: 'hen', meaning: 'weird' },
    { jp: 'へた', romaji: 'heta', meaning: 'bad at it' },
  ]},
  { char: 'ほ', romaji: 'ho', kana: 'hiragana', words: [
    { jp: 'ほん', romaji: 'hon', meaning: 'book' },
    { jp: 'ほしい', romaji: 'hoshii', meaning: 'I want it' },
    { jp: 'ほんとう', romaji: 'hontou', meaning: 'really' },
  ]},

  { char: 'ま', romaji: 'ma', kana: 'hiragana', words: [
    { jp: 'まだ', romaji: 'mada', meaning: 'not yet / still' },
    { jp: 'まつ', romaji: 'matsu', meaning: 'to wait' },
    { jp: 'まあまあ', romaji: 'maa maa', meaning: 'so-so' },
  ]},
  { char: 'み', romaji: 'mi', kana: 'hiragana', words: [
    { jp: 'みず', romaji: 'mizu', meaning: 'water' },
    { jp: 'みる', romaji: 'miru', meaning: 'to see / watch' },
    { jp: 'みち', romaji: 'michi', meaning: 'road / way' },
  ]},
  { char: 'む', romaji: 'mu', kana: 'hiragana', words: [
    { jp: 'むずかしい', romaji: 'muzukashii', meaning: 'difficult' },
    { jp: 'むり', romaji: 'muri', meaning: 'impossible' },
    { jp: 'むかし', romaji: 'mukashi', meaning: 'long ago' },
  ]},
  { char: 'め', romaji: 'me', kana: 'hiragana', words: [
    { jp: 'め', romaji: 'me', meaning: 'eye' },
    { jp: 'めし', romaji: 'meshi', meaning: 'meal (casual)' },
    { jp: 'めんどう', romaji: 'mendou', meaning: 'pain / hassle' },
  ]},
  { char: 'も', romaji: 'mo', kana: 'hiragana', words: [
    { jp: 'もう', romaji: 'mou', meaning: 'already' },
    { jp: 'もっと', romaji: 'motto', meaning: 'more' },
    { jp: 'もしもし', romaji: 'moshi moshi', meaning: 'hello (phone)' },
  ]},

  { char: 'や', romaji: 'ya', kana: 'hiragana', words: [
    { jp: 'やすい', romaji: 'yasui', meaning: 'cheap' },
    { jp: 'やま', romaji: 'yama', meaning: 'mountain' },
    { jp: 'やばい', romaji: 'yabai', meaning: 'crazy / wild' },
  ]},
  { char: 'ゆ', romaji: 'yu', kana: 'hiragana', words: [
    { jp: 'ゆき', romaji: 'yuki', meaning: 'snow' },
    { jp: 'ゆうめい', romaji: 'yuumei', meaning: 'famous' },
    { jp: 'ゆっくり', romaji: 'yukkuri', meaning: 'slowly' },
  ]},
  { char: 'よ', romaji: 'yo', kana: 'hiragana', words: [
    { jp: 'よる', romaji: 'yoru', meaning: 'night' },
    { jp: 'よむ', romaji: 'yomu', meaning: 'to read' },
    { jp: 'よかった', romaji: 'yokatta', meaning: 'glad / good' },
  ]},

  { char: 'ら', romaji: 'ra', kana: 'hiragana', words: [
    { jp: 'らくだ', romaji: 'rakuda', meaning: 'camel' },
    { jp: 'らいねん', romaji: 'rainen', meaning: 'next year' },
    { jp: 'らーめん', romaji: 'raamen', meaning: 'ramen' },
  ]},
  { char: 'り', romaji: 'ri', kana: 'hiragana', words: [
    { jp: 'りんご', romaji: 'ringo', meaning: 'apple' },
    { jp: 'りょうり', romaji: 'ryouri', meaning: 'cooking' },
    { jp: 'りょこう', romaji: 'ryokou', meaning: 'travel' },
  ]},
  { char: 'る', romaji: 'ru', kana: 'hiragana', words: [
    { jp: 'るす', romaji: 'rusu', meaning: 'not home' },
    { jp: 'みる', romaji: 'miru', meaning: 'to see' },
    { jp: 'する', romaji: 'suru', meaning: 'to do' },
  ]},
  { char: 'れ', romaji: 're', kana: 'hiragana', words: [
    { jp: 'れんしゅう', romaji: 'renshuu', meaning: 'practice' },
    { jp: 'れいぞうこ', romaji: 'reizouko', meaning: 'refrigerator' },
    { jp: 'これ', romaji: 'kore', meaning: 'this' },
  ]},
  { char: 'ろ', romaji: 'ro', kana: 'hiragana', words: [
    { jp: 'ろく', romaji: 'roku', meaning: 'six' },
    { jp: 'いろ', romaji: 'iro', meaning: 'color' },
    { jp: 'おふろ', romaji: 'ofuro', meaning: 'bath' },
  ]},

  { char: 'わ', romaji: 'wa', kana: 'hiragana', words: [
    { jp: 'わたし', romaji: 'watashi', meaning: 'I / me' },
    { jp: 'わかる', romaji: 'wakaru', meaning: 'to understand' },
    { jp: 'わるい', romaji: 'warui', meaning: 'bad / sorry' },
  ]},
  { char: 'を', romaji: 'wo', kana: 'hiragana', words: [
    { jp: 'ほんを', romaji: 'hon wo', meaning: '(book) [obj marker]' },
    { jp: 'みずを', romaji: 'mizu wo', meaning: '(water) [obj marker]' },
    { jp: 'なにを', romaji: 'nani wo', meaning: 'what? [obj marker]' },
  ]},
  { char: 'ん', romaji: 'n', kana: 'hiragana', words: [
    { jp: 'うん', romaji: 'un', meaning: 'yeah' },
    { jp: 'ほん', romaji: 'hon', meaning: 'book' },
    { jp: 'にほん', romaji: 'nihon', meaning: 'Japan' },
  ]},
]

export const buildDeck = (chars: KanaCharacter[] = HIRAGANA) => {
  const deck = []
  const seen = new Set<string>()
  for (const item of chars) {
    for (const word of item.words) {
      const id = `${item.kana}-${item.char}-${word.jp}`
      if (seen.has(id)) continue
      seen.add(id)
      deck.push({
        id,
        jp: word.jp,
        romaji: word.romaji,
        meaning: word.meaning,
        character: item.char,
        kana: item.kana,
      })
    }
  }
  return deck
}
