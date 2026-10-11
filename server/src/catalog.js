// Kategorie (v pořadí, jak se prochází obchodem) a základní číselník surovin.
// Díky tomu se nové suroviny samy zařadí a nepadají do „Ostatní“.

const CATEGORIES = [
  'Pečivo',
  'Zelenina a ovoce',
  'Maso a ryby',
  'Mléčné a vejce',
  'Trvanlivé',
  'Koření',
  'Mražené',
  'Nápoje',
  'Drogerie',
  'Ostatní',
];

// Suroviny, které běžně máme doma – při přidávání receptu do nákupu jsou předvolené jako „nepřidávat“.
const PANTRY = new Set(['sůl', 'pepř', 'olej', 'olivový olej', 'voda', 'cukr', 'mouka hladká', 'ocet']);

const SEED = {
  'Pečivo': ['chléb', 'rohlíky', 'bageta', 'toustový chléb', 'tortilly', 'houska', 'knedlík', 'pita chléb', 'bulky na burger'],
  'Zelenina a ovoce': [
    'cibule', 'červená cibule', 'jarní cibulka', 'česnek', 'brambory', 'batáty', 'mrkev', 'petržel kořen', 'celer', 'pórek',
    'rajčata', 'cherry rajčata', 'paprika', 'okurka', 'salát ledový', 'polníček', 'rukola', 'špenát', 'zelí bílé', 'zelí červené',
    'brokolice', 'květák', 'cuketa', 'lilek', 'dýně hokkaido', 'žampiony', 'houby', 'kukuřice', 'hrášek', 'fazolové lusky', 'ředkvičky',
    'zázvor', 'chilli paprička', 'citron', 'limetka', 'pomeranč', 'jablka', 'banány', 'hrušky', 'avokádo', 'jahody', 'borůvky', 'maliny',
    'petrželová nať', 'koriandr čerstvý', 'bazalka čerstvá', 'pažitka', 'kopr', 'máta',
  ],
  'Maso a ryby': [
    'kuřecí prsa', 'kuřecí stehna', 'kuře celé', 'krůtí prsa', 'vepřová panenka', 'vepřová krkovice', 'vepřové maso', 'hovězí maso',
    'mleté maso', 'mleté hovězí', 'slanina', 'šunka', 'uzené maso', 'klobása', 'párky', 'losos', 'treska', 'tuňák v konzervě', 'krevety',
  ],
  'Mléčné a vejce': [
    'mléko', 'smetana na vaření', 'smetana ke šlehání', 'zakysaná smetana', 'jogurt bílý', 'řecký jogurt', 'máslo', 'vejce',
    'tvaroh', 'eidam', 'mozzarella', 'parmazán', 'feta', 'balkánský sýr', 'čedar', 'mascarpone', 'ricotta', 'smetanový sýr', 'kefír',
  ],
  'Trvanlivé': [
    'mouka hladká', 'mouka polohrubá', 'mouka hrubá', 'cukr', 'cukr moučka', 'cukr vanilkový', 'rýže', 'basmati rýže', 'jasmínová rýže',
    'rýže na rizoto', 'těstoviny', 'špagety', 'penne', 'rýžové nudle', 'vaječné nudle', 'kuskus', 'bulgur', 'čočka', 'červená čočka',
    'cizrna', 'fazole', 'fazole červené', 'ovesné vločky', 'strouhanka', 'olej', 'olivový olej', 'ocet', 'sójová omáčka',
    'rajčatový protlak', 'drcená rajčata', 'passata', 'kokosové mléko', 'vývar', 'bujón', 'kečup', 'hořčice', 'majonéza', 'med',
    'droždí', 'prášek do pečiva', 'kakao', 'čokoláda', 'vlašské ořechy', 'mandle', 'arašídy', 'rozinky', 'kukuřičný škrob',
    'pesto', 'olivy', 'kari pasta', 'teriyaki omáčka', 'sladká chilli omáčka', 'arašídové máslo',
  ],
  'Koření': [
    'sůl', 'pepř', 'paprika sladká mletá', 'paprika uzená', 'kmín', 'majoránka', 'oregano', 'bazalka sušená', 'tymián', 'rozmarýn',
    'skořice', 'muškátový oříšek', 'bobkový list', 'nové koření', 'garam masala', 'kari koření', 'kurkuma', 'chilli mleté',
    'česnek sušený', 'zázvor mletý', 'kardamom', 'vanilkový lusk', 'kmín římský', 'pětikoření',
  ],
  'Mražené': ['mražený hrášek', 'mražená zelenina', 'mražené ovoce', 'zmrzlina', 'listové těsto'],
  'Nápoje': ['voda', 'minerálka', 'džus', 'víno bílé', 'víno červené', 'pivo'],
  'Drogerie': ['pečicí papír', 'alobal', 'potravinová fólie', 'sáčky na svačinu', 'prostředek na nádobí', 'toaletní papír', 'papírové utěrky'],
};

// Pravidla pro novou surovinu, kterou číselník ještě nezná (první shoda vyhrává).
const RULES = [
  ['Mražené', /mražen/],
  ['Trvanlivé', /kokosov|arašídov|kakaov|sušen(é|á) rajč/],
  ['Koření', /(^|\s)(sůl|pepř|kmín|majoránk|oregan|tymián|rozmarýn|skořic|muškát|bobkov|nové koření|garam|kurkum|kardamom|badyán|hřebíček|pískavic)|mlet(á|ý)(\s|$)|chilli mlet|koření/],
  ['Pečivo', /chléb|chleb|rohlík|bageta|toust|tortil|houska|knedlík|bulk|pita|croissant|vánočk|pečivo/],
  ['Maso a ryby', /kuř|kuře|vepř|hověz|telec|jehněč|krůt|kachn|husa|mlet[éý] maso|slanin|šunk|salám|klobás|párek|párky|uzen|maso|řízek|panenk|krkovic|plec|losos|tuňák|treska|pstruh|kapr|ryb|krevet|chobotn|sépie/],
  ['Mléčné a vejce', /mléko|mléka|smetan|sýr|jogurt|tvaroh|máslo|vejce|vajíčk|mozzarel|parmez|parmaz|eidam|gouda|feta|balkán|ricott|mascarpone|kefír|podmáslí|šlehačk|niva|hermelín|čedar|cottage/],
  ['Zelenina a ovoce', /cibul|česnek|mrkev|brambor|batát|rajč|paprik|okurk|salát|zelí|brokolic|květák|cuket|lilek|špenát|petržel|celer|pórek|zázvor|citron|limet|jabl|banán|hrušk|pomeranč|mandarink|avokád|hub|žampion|hlív|kukuřic|hrášek|lusk|ředkv|dýn|koriandr|bazalk|pažitk|kopr|máta|rukol|polníč|jahod|borůvk|malin|hrozn|meloun|ananas|mango|kiwi|švestk|meruňk|broskv|třešn|višn|ovoce|zelenin|chilli paprič|řapík|fenykl|kedluben|řepa|chřest/],
  ['Trvanlivé', /mouk|cukr|rýž|těstovin|špaget|penne|fusilli|lasagn|nudl|kuskus|bulgur|quinoa|olej|ocet|protlak|konzerv|plechov|passat|drcená|kokosov|čočk|cizrn|fazol|vločk|med$|^med|sójov|omáčk|vývar|bujón|kečup|hořčic|majonéz|droždí|prášek do|kakao|čokolád|ořech|ořís|mandl|arašíd|pistáci|kešu|semín|sezam|chia|rozink|brusink|datl|strouhank|škrob|pesto|oliv|pasta|sirup|džem|marmelád|želatin|pudink/],
  ['Nápoje', /víno|pivo|džus|minerálk|voda|limonád|sodovk|káva|čaj/],
  ['Drogerie', /papír|alobal|fóli|sáčk|prostředek|mýdl|toalet|utěrk|houbičk|tablety do/],
];

function suggestCategoryName(name) {
  const s = String(name || '').toLocaleLowerCase('cs').trim();
  for (const [cat, re] of RULES) if (re.test(s)) return cat;
  return 'Ostatní';
}

module.exports = { CATEGORIES, SEED, PANTRY, suggestCategoryName };
