/**
 * Curated, platform-wide FOOD vocabulary (not restaurant category names).
 * One code per concept; ar/en/it are carefully reviewed labels, not machine-translated aliases.
 * Avoid ambiguous synonyms: plain "meat"/"لحم" is NOT beef, and "raw" is a Presentation State.
 * The seed CLI never guesses image state or suitable business sector from these tags.
 */
export interface FoodTagSeed {
  code: string;
  group: string;
  nameAr: string;
  nameEn: string;
  nameIt: string;
  aliases: { ar: string[]; en: string[]; it: string[] };
}
type TagGroup =
  | 'PROTEIN'
  | 'CUT'
  | 'DISH'
  | 'HOME'
  | 'DESSERT'
  | 'DRINK'
  | 'INGREDIENT'
  | 'PREPARATION'
  | 'SAUCE'
  | 'BAKERY'
  | 'PORTION';

/** Format per row: CODE|Arabic|English|Italian|extra Arabic aliases (;)|English aliases (;)|Italian aliases (;) */
const DATA: Record<TagGroup, string> = {
  PROTEIN: String.raw`
BEEF|لحم بقري|Beef|Manzo|لحمة بقري;لحمة بقري طازة||
VEAL|لحم بتلو|Veal|Vitello|بتلو||
LAMB|لحم حمل|Lamb|Agnello|لحمة حمل;ضاني صغير||
MUTTON|لحم ضأن|Mutton|Carne ovina|لحمة ضاني;لحم خروف||
GOAT|لحم ماعز|Goat meat|Carne di capra|لحمة ماعز||
CHICKEN|دجاج|Chicken|Pollo|فراخ;فراخ بلدي;دجاجة||
TURKEY|ديك رومي|Turkey|Tacchino|رومي||
DUCK|بط|Duck|Anatra|بطة||
RABBIT|أرنب|Rabbit|Coniglio|لحم أرنب||
FISH|سمك|Fish|Pesce|أسماك||
SALMON|سلمون|Salmon|Salmone|||
TUNA|تونة|Tuna|Tonno|||
SEA_BASS|قاروص|Sea bass|Branzino|سي باس||
SEA_BREAM|دنيس|Sea bream|Orata|||
TILAPIA|بلطي|Tilapia|Tilapia|||
COD|سمك القد|Cod|Merluzzo|||
SARDINE|سردين|Sardine|Sardina|||
ANCHOVY|أنشوجة|Anchovy|Acciuga|أنشوفة||
SHRIMP|جمبري|Shrimp|Gambero|روبيان;قريدس|Prawn|Gamberetti
SQUID|سبيط|Squid|Calamaro|كاليماري;حبار|Calamari|Calamari
OCTOPUS|أخطبوط|Octopus|Polpo|||
CRAB|كابوريا|Crab|Granchio|سلطعون||
LOBSTER|استاكوزا|Lobster|Aragosta|لوبستر||
MUSSEL|بلح البحر|Mussel|Cozza||Mussels|Cozze
CLAM|محار|Clam|Vongola||Clams|Vongole
EGG|بيض|Egg|Uovo|بيضة|Eggs|Uova
BEEF_LIVER|كبدة بقري|Beef liver|Fegato di manzo|كبد بقري||
CHICKEN_LIVER|كبدة فراخ|Chicken liver|Fegatini di pollo|كبد دجاج||
CHICKEN_GIZZARD|قوانص دجاج|Chicken gizzard|Ventriglio di pollo|قوانص فراخ||
MEAT_MIX|لحوم مشكلة|Mixed meat|Carni miste|تشكيلة لحوم||
`,
  CUT: String.raw`
RIBEYE|ريب آي|Ribeye|Costata di manzo|ريب اي|Rib eye|
TENDERLOIN|فيليه لحم|Tenderloin|Filetto di manzo|تندرلوين;فيليه بقري||
SIRLOIN|سيرلوين|Sirloin|Controfiletto|ستريب لوين||
T_BONE|تي بون|T-bone steak|Bistecca T-bone|تي بون ستيك||
BRISKET|صدر بقري|Beef brisket|Punta di petto|صدر عجل|Brisket|
SHORT_RIBS|ضلوع قصيرة|Short ribs|Costine corte|||
BEEF_RIBS|ريش بقري|Beef ribs|Costine di manzo|||
LAMB_CHOPS|ريش ضاني|Lamb chops|Costolette di agnello|ريش خروف||
LAMB_SHANK|موزة ضاني|Lamb shank|Stinco di agnello|||
BEEF_SHANK|موزة بقري|Beef shank|Geretto di manzo|||
BEEF_ROAST_CUT|عرق روستو|Beef roast cut|Taglio per arrosto|||
BEEF_CUBES|مكعبات لحم بقري|Diced beef|Manzo a cubetti|لحمة مكعبات بقري||
BEEF_STRIPS|شرائح لحم بقري|Beef strips|Straccetti di manzo|||
GROUND_BEEF|لحمة مفرومة بقري|Ground beef|Carne macinata di manzo|مفروم بقري|Minced beef|Macinato di manzo
GROUND_LAMB|لحمة مفرومة ضاني|Ground lamb|Agnello macinato|مفروم ضاني||
CHICKEN_BREAST|صدور فراخ|Chicken breast|Petto di pollo|صدر دجاج||
CHICKEN_THIGH|وراك فراخ|Chicken thigh|Coscia di pollo|فخذ دجاج||
CHICKEN_WINGS|أجنحة دجاج|Chicken wings|Ali di pollo|جوانح فراخ;أجنحة فراخ||
CHICKEN_DRUMSTICK|دبوس فراخ|Chicken drumstick|Fusello di pollo|دبابيس فراخ||
WHOLE_CHICKEN|فرخة كاملة|Whole chicken|Pollo intero|دجاجة كاملة||
CHICKEN_FILLET|فيليه دجاج|Chicken fillet|Filetto di pollo|فيليه فراخ||
BONELESS_BEEF|لحم بقري بدون عظم|Boneless beef|Manzo disossato|لحمة بقري بدون عضم||
BONE_IN_BEEF|لحم بقري بالعظم|Bone-in beef|Manzo con osso|لحمة بعظم بقري||
MEAT_SAUSAGE|سجق لحمة|Meat sausage|Salsiccia di carne|سجق بلدي||
FISH_FILLET|فيليه سمك|Fish fillet|Filetto di pesce|||
WHOLE_FISH|سمكة كاملة|Whole fish|Pesce intero|||
PEELED_SHRIMP|جمبري مقشر|Peeled shrimp|Gamberi sgusciati|روبيان مقشر||
BEEF_KIDNEY|كلاوي بقري|Beef kidney|Rene di manzo|||
OX_TAIL|ذيل بقري|Oxtail|Coda di bue|عكاوي بقري||
LAMB_SHOULDER|كتف ضاني|Lamb shoulder|Spalla di agnello|||
`,
  DISH: String.raw`
BURGER|برجر|Burger|Hamburger|برغر||
CHEESEBURGER|تشيز برجر|Cheeseburger|Cheeseburger|برجر بالجبنة||
PIZZA|بيتزا|Pizza|Pizza|||
MARGHERITA_PIZZA|بيتزا مارجريتا|Margherita pizza|Pizza Margherita|بيتزا مارجريتا||
PEPPERONI_PIZZA|بيتزا بيبروني|Pepperoni pizza|Pizza al salame piccante|||
QUATTRO_FORMAGGI|بيتزا أربع جبن|Four cheese pizza|Pizza quattro formaggi|بيتزا فور تشيز;بيتزا 4 جبن||
CALZONE|كالزوني|Calzone|Calzone|||
PASTA|مكرونة|Pasta|Pasta|باستا||
SPAGHETTI|سباجيتي|Spaghetti|Spaghetti|اسباجيتي||
PENNE|بيني|Penne|Penne|||
LASAGNA|لازانيا|Lasagna|Lasagne|||
RAVIOLI|رافيولي|Ravioli|Ravioli|||
RISOTTO|ريزوتو|Risotto|Risotto|||
SANDWICH|ساندوتش|Sandwich|Panino|ساندويتش;سندوتش||
WRAP|راب|Wrap|Piadina arrotolata|ساندوتش راب||
SHAWARMA|شاورما|Shawarma|Shawarma|||
GYRO|جيروس|Gyro|Gyros|||
KEBAB|كباب|Kebab|Kebab|||
KOFTA|كفتة|Kofta|Kofta|كفته||
STEAK|ستيك|Steak|Bistecca|||
GRILLED_CHICKEN_DISH|فراخ مشوية|Grilled chicken|Pollo alla griglia|دجاج مشوي||
FRIED_CHICKEN_DISH|فراخ مقلية|Fried chicken|Pollo fritto|دجاج مقلي||
CHICKEN_NUGGETS|ناجتس فراخ|Chicken nuggets|Bocconcini di pollo|||
CHICKEN_STRIPS|تشيكن ستربس|Chicken strips|Strisce di pollo|||
FALAFEL|طعمية|Falafel|Falafel|فلافل||
HAWAWSHI|حواوشي|Hawawshi|Hawawshi|||
FISH_AND_CHIPS|سمك وبطاطس|Fish and chips|Fish and chips|||
SEAFOOD_PLATTER|وجبة سي فود|Seafood platter|Piatto di frutti di mare|طبق مأكولات بحرية||
RICE_BOWL|طبق أرز|Rice bowl|Ciotola di riso|||
SOUP|شوربة|Soup|Zuppa|حساء||
SALAD|سلطة|Salad|Insalata|||
TACOS|تاكو|Tacos|Tacos|||
NACHOS|ناتشوز|Nachos|Nachos|||
QUESADILLA|كاساديا|Quesadilla|Quesadilla|||
BIRYANI|برياني|Biryani|Biryani|||
KABSA|كبسة|Kabsa|Kabsa|||
MANSAF|منسف|Mansaf|Mansaf|||
MANDI|مندي|Mandi|Mandi|||
MAQLUBA|مقلوبة|Maqluba|Maqluba|||
SUSHI|سوشي|Sushi|Sushi|||
SASHIMI|ساشيمي|Sashimi|Sashimi|||
RAMEN|رامن|Ramen|Ramen|||
NOODLES|نودلز|Noodles|Noodles|||
DIM_SUM|ديم سوم|Dim sum|Dim sum|||
SPRING_ROLL|سبرينج رول|Spring roll|Involtino primavera|لفائف الربيع||
FRIES|بطاطس مقلية|French fries|Patatine fritte|فرنش فرايز|Chips|
ONION_RINGS|حلقات بصل|Onion rings|Anelli di cipolla|||
MASHED_POTATO|بطاطس بيوريه|Mashed potatoes|Purè di patate|||
BAKED_POTATO|بطاطس في الفرن|Baked potato|Patata al forno|||
OMELETTE|أومليت|Omelette|Frittata|عجة بيض||
SHISH_TAWOOK|شيش طاووق|Shish tawook|Shish tawook|||
MIXED_GRILL|مشويات مشكلة|Mixed grill|Grigliata mista|طبق مشويات||
CHICKEN_SCHNITZEL|شنيتسل فراخ|Chicken schnitzel|Cotoletta di pollo|فراخ بانيه||
CHICKEN_FAJITA|فاهيتا فراخ|Chicken fajita|Fajitas di pollo|||
BEEF_FAJITA|فاهيتا لحمة|Beef fajita|Fajitas di manzo|||
`,
  HOME: String.raw`
MOLOKHIA|ملوخية|Molokhia|Molokhia|||
OKRA_STEW|بامية بالصلصة|Okra stew|Stufato di gombo|بامية مطبوخة||
PEAS_STEW|بسلة بالصلصة|Pea stew|Stufato di piselli|بسلة مطبوخة||
GREEN_BEANS_STEW|فاصوليا خضرا بالصلصة|Green beans stew|Fagiolini in umido|||
WHITE_BEANS_STEW|فاصوليا بيضا|White bean stew|Fagioli bianchi in umido|||
STUFFED_GRAPE_LEAVES|ورق عنب محشي|Stuffed grape leaves|Foglie di vite ripiene|ورق عنب||
STUFFED_CABBAGE|محشي كرنب|Stuffed cabbage|Involtini di cavolo|محشي ملفوف||
STUFFED_ZUCCHINI|كوسة محشي|Stuffed zucchini|Zucchine ripiene|||
STUFFED_PEPPER|فلفل محشي|Stuffed pepper|Peperoni ripieni|||
MAHSHI_MIX|محشي مشكل|Mixed mahshi|Verdure ripiene miste|محاشي مشكلة||
KOSHARI|كشري|Koshari|Koshari|||
FUL_MEDAMES|فول مدمس|Ful medames|Fave stufate|فول||
LENTIL_SOUP|شوربة عدس|Lentil soup|Zuppa di lenticchie|||
ROZ_MOAMMAR|أرز معمر|Baked Egyptian rice|Riso egiziano al forno|||
FATTAH|فتة|Fattah|Fatta egiziana|||
MUSAKHAN|مسخن|Musakhan|Musakhan|||
MACARONI_BESHAMEL|مكرونة بشاميل|Baked pasta with béchamel|Pasta al forno con besciamella|||
TORLY|تورلي|Vegetable stew|Stufato di verdure|||
MOUSSAKA_EGYPTIAN|مسقعة مصرية|Egyptian moussaka|Moussaka egiziana|مسقعة||
BAMIA_WITH_MEAT|بامية باللحمة|Okra with meat|Gombo con carne|||
MOLOKHIA_WITH_CHICKEN|ملوخية بالفراخ|Molokhia with chicken|Molokhia con pollo|||
ROASTED_DUCK_DISH|بط محمر|Roasted duck|Anatra arrosto|||
RICE_WITH_VERMICELLI|رز بالشعرية|Vermicelli rice|Riso con vermicelli|أرز بالشعرية||
SAYADIYA|صيادية سمك|Sayadiya fish rice|Riso sayadiya con pesce|||
BECHAMEL_VEGETABLES|خضار بالبشاميل|Vegetables with béchamel|Verdure con besciamella|||
TURKISH_DOLMA|دولمة|Dolma|Dolma|||
TABBOULEH|تبولة|Tabbouleh|Tabbouleh|||
FATTOUSH|فتوش|Fattoush|Fattoush|||
BABA_GHANOUSH|بابا غنوج|Baba ghanoush|Baba ganoush|||
HUMMUS|حمص بالطحينة|Hummus|Hummus|||
MUTABBAL|متبل باذنجان|Mutabbal|Mutabbal|||
FATTEH_HUMMUS|فتة حمص|Hummus fatteh|Fatteh di ceci|||
EGGPLANT_MUSSAKA|مسقعة باذنجان|Eggplant moussaka|Moussaka di melanzane|||
RICE_PILAF|رز بسمتي|Basmati rice|Riso basmati|أرز بسمتي||
CHICKEN_STEW|يخنة دجاج|Chicken stew|Spezzatino di pollo|يخنة فراخ||
BEEF_STEW|يخنة لحم بقري|Beef stew|Spezzatino di manzo|||
`,
  DESSERT: String.raw`
CAKE|كيك|Cake|Torta|كيكة||
CHEESECAKE|تشيز كيك|Cheesecake|Cheesecake|||
CHOCOLATE_CAKE|كيك شوكولاتة|Chocolate cake|Torta al cioccolato|||
CARROT_CAKE|كيك جزر|Carrot cake|Torta di carote|||
RED_VELVET|ريد فيلفت|Red velvet cake|Torta red velvet|||
TIRAMISU|تيراميسو|Tiramisu|Tiramisù|||
PANNA_COTTA|بانا كوتا|Panna cotta|Panna cotta|||
BROWNIE|براوني|Brownie|Brownie|||
COOKIE|كوكيز|Cookie|Biscotto|كوكي|Cookies|Biscotti
DONUT|دونات|Donut|Ciambella|دونت|Doughnut|
MUFFIN|مافن|Muffin|Muffin|||
CUPCAKE|كب كيك|Cupcake|Cupcake|||
MACARON|ماكرون|Macaron|Macaron|||
ECLAIR|إكلير|Éclair|Éclair|اكلير||
PROFITEROLE|بروفيترول|Profiterole|Profiteroles|||
CANNOLI|كانولي|Cannoli|Cannoli|||
BAKLAVA|بقلاوة|Baklava|Baklava|بقلاوا||
KUNAFA|كنافة|Kunafa|Kunafa|كنافه|Knafeh|
BASBOUSA|بسبوسة|Basbousa|Basbousa|بسبوسه||
OM_ALI|أم علي|Om Ali|Om Ali|ام علي||
RICE_PUDDING|رز بلبن|Rice pudding|Budino di riso|أرز بالحليب||
GELATO|جيلاتو|Gelato|Gelato|||
ICE_CREAM|آيس كريم|Ice cream|Gelato confezionato|ايس كريم||
SORBET|سوربيه|Sorbet|Sorbetto|||
CREPE|كريب|Crêpe|Crêpe|||
WAFFLE|وافل|Waffle|Waffle|||
PANCAKE|بان كيك|Pancake|Pancake|||
FRENCH_TOAST|فرنش توست|French toast|Pain perdu|||
PIE|فطيرة حلوة|Sweet pie|Crostata dolce|||
TART|تارت|Tart|Crostata|||
STRUDEL|سترودل|Strudel|Strudel|||
CHURROS|تشوروز|Churros|Churros|||
QATAYEF|قطايف|Qatayef|Qatayef|||
MAAMOUL|معمول|Maamoul|Maamoul|||
GHRAYBEH|غريبة|Ghraybeh|Ghraybeh|||
PETIT_FOUR|بيتي فور|Petit four|Pasticcini|||
SABLE_BISCUIT|سابليه|Sablé biscuit|Biscotto sablé|||
LOQMAT_AL_QADI|لقمة القاضي|Luqmat al qadi|Luqmat al qadi|زلابية بالعسل||
HALAWA|حلاوة طحينية|Halva|Halva|حلاوة||
MOUSSE|موس|Mousse|Mousse|||
PUDDING|بودينج|Pudding|Budino|||
TRUFFLE_DESSERT|ترافل شوكولاتة|Chocolate truffle|Tartufo al cioccolato|||
`,
  DRINK: String.raw`
COFFEE|قهوة|Coffee|Caffè|قهوه||
ESPRESSO|إسبريسو|Espresso|Espresso|اسبريسو||
DOPPIO|دبل إسبريسو|Double espresso|Doppio espresso|دبل اسبريسو|Doppio|
AMERICANO|أمريكانو|Americano|Caffè americano|||
CAPPUCCINO|كابتشينو|Cappuccino|Cappuccino|||
LATTE|لاتيه|Latte coffee|Caffellatte|كافيه لاتيه|Caffè latte;Latte|Latte macchiato
FLAT_WHITE|فلات وايت|Flat white|Flat white|||
MACCHIATO|ماكياتو|Macchiato|Caffè macchiato|||
MOCHA|موكا|Mocha coffee|Mocaccino|||
HOT_CHOCOLATE|هوت شوكليت|Hot chocolate|Cioccolata calda|شوكولاتة ساخنة||
TEA|شاي|Tea|Tè|||
BLACK_TEA|شاي أسود|Black tea|Tè nero|||
GREEN_TEA|شاي أخضر|Green tea|Tè verde|||
MATCHA|ماتشا|Matcha|Matcha|||
CHAI_LATTE|تشاي لاتيه|Chai latte|Chai latte|||
ICED_COFFEE|قهوة مثلجة|Iced coffee|Caffè freddo|||
ICED_LATTE|آيس لاتيه|Iced latte|Latte freddo|ايس لاتيه||
COLD_BREW|كولد برو|Cold brew|Caffè estratto a freddo|||
FRAPPE|فرابيه|Frappé|Frappè|||
MILKSHAKE|ميلك شيك|Milkshake|Frullato al latte|||
SMOOTHIE|سموذي|Smoothie|Smoothie|||
LEMONADE|ليمونادة|Lemonade|Limonata|||
VIRGIN_MOJITO|موهيتو بدون كحول|Virgin mojito|Mojito analcolico|موهيتو||
ORANGE_JUICE|عصير برتقال|Orange juice|Succo d'arancia|||
APPLE_JUICE|عصير تفاح|Apple juice|Succo di mela|||
MANGO_JUICE|عصير مانجو|Mango juice|Succo di mango|||
STRAWBERRY_JUICE|عصير فراولة|Strawberry juice|Succo di fragola|||
GUAVA_JUICE|عصير جوافة|Guava juice|Succo di guava|||
POMEGRANATE_JUICE|عصير رمان|Pomegranate juice|Succo di melograno|||
WATER|مياه|Water|Acqua|ماء||
SPARKLING_WATER|مياه غازية|Sparkling water|Acqua frizzante|||
SOFT_DRINK|مشروب غازي|Soft drink|Bibita gassata|صودا||
COLA|كولا|Cola|Cola|||
ENERGY_DRINK|مشروب طاقة|Energy drink|Bevanda energetica|||
HIBISCUS|كركديه|Hibiscus drink|Karkadè|||
TAMARIND|تمر هندي|Tamarind drink|Bevanda al tamarindo|||
SAHLAB|سحلب|Sahlab|Sahlab|||
CAROB_DRINK|خروب|Carob drink|Bevanda alla carruba|||
LICORICE_DRINK|عرقسوس|Licorice drink|Bevanda alla liquirizia|||
SUGARCANE_JUICE|عصير قصب|Sugarcane juice|Succo di canna da zucchero|||
LEMON_MINT|ليمون بالنعناع|Mint lemonade|Limonata alla menta|||
CHOCOLATE_MILKSHAKE|ميلك شيك شوكولاتة|Chocolate milkshake|Frullato al cioccolato|||
STRAWBERRY_MILKSHAKE|ميلك شيك فراولة|Strawberry milkshake|Frullato alla fragola|||
VANILLA_MILKSHAKE|ميلك شيك فانيليا|Vanilla milkshake|Frullato alla vaniglia|||
`,
  INGREDIENT: String.raw`
TOMATO|طماطم|Tomato|Pomodoro|بندورة||
CUCUMBER|خيار|Cucumber|Cetriolo|||
LETTUCE|خس|Lettuce|Lattuga|||
ONION|بصل|Onion|Cipolla|||
GARLIC|ثوم|Garlic|Aglio|||
POTATO|بطاطس|Potato|Patata|بطاطس طازة|Potatoes|Patate
SWEET_POTATO|بطاطا حلوة|Sweet potato|Patata dolce|||
CARROT|جزر|Carrot|Carota|||
BELL_PEPPER|فلفل رومي|Bell pepper|Peperone|فلفل حلو||
CHILI_PEPPER|فلفل حار|Chili pepper|Peperoncino|شطة حمراء||
MUSHROOM|مشروم|Mushroom|Fungo|فطر|Mushrooms|Funghi
EGGPLANT|باذنجان|Eggplant|Melanzana|بتنجان|Aubergine|
ZUCCHINI|كوسة|Zucchini|Zucchina||Courgette|
SPINACH|سبانخ|Spinach|Spinaci|||
BASIL|ريحان|Basil|Basilico|||
PARSLEY|بقدونس|Parsley|Prezzemolo|||
CILANTRO|كزبرة خضراء|Cilantro|Coriandolo|كسبرة|Coriander leaves|
ARUGULA|جرجير|Arugula|Rucola||Rocket|
BROCCOLI|بروكلي|Broccoli|Broccoli|||
CORN|ذرة|Corn|Mais||Sweetcorn|
OLIVE|زيتون|Olive|Oliva||Olives|Olive
AVOCADO|أفوكادو|Avocado|Avocado|||
LEMON|ليمون أصفر|Lemon|Limone|ليمون حامض أصفر||
LIME|لايم|Lime|Lime|ليمون أخضر||
CHEESE|جبنة|Cheese|Formaggio|جبن||
MOZZARELLA|موتزاريلا|Mozzarella|Mozzarella|جبنة موتزاريلا||
CHEDDAR|شيدر|Cheddar|Cheddar|جبنة شيدر||
PARMESAN|بارميزان|Parmesan|Parmigiano|جبنة بارميزان||
FETA|فيتا|Feta|Feta|جبنة فيتا||
BURRATA|بوراتا|Burrata|Burrata|||
BUTTER|زبدة|Butter|Burro|||
YOGURT|زبادي|Yogurt|Yogurt||Yoghurt|
CREAM|كريمة|Cream|Panna|||
MILK|حليب|Milk|Latte|لبن||
CHOCOLATE|شوكولاتة|Chocolate|Cioccolato|شيكولاتة||
WHITE_CHOCOLATE|شوكولاتة بيضاء|White chocolate|Cioccolato bianco|||
DARK_CHOCOLATE|شوكولاتة داكنة|Dark chocolate|Cioccolato fondente|||
VANILLA|فانيليا|Vanilla|Vaniglia|||
HONEY|عسل نحل|Honey|Miele|عسل طبيعي||
CARAMEL|كراميل|Caramel|Caramello|||
STRAWBERRY|فراولة|Strawberry|Fragola|||
MANGO|مانجو|Mango|Mango|||
BANANA|موز|Banana|Banana|||
BLUEBERRY|توت أزرق|Blueberry|Mirtillo|||
RASPBERRY|توت العليق|Raspberry|Lampone|||
PINEAPPLE|أناناس|Pineapple|Ananas|||
COCONUT|جوز هند|Coconut|Cocco|||
DATES|تمر|Dates|Datteri|بلح||
PISTACHIO|فستق|Pistachio|Pistacchio|فستق حلبي||
ALMOND|لوز|Almond|Mandorla|||
WALNUT|عين جمل|Walnut|Noce|جوز||
PEANUT|فول سوداني|Peanut|Arachide|||
HAZELNUT|بندق|Hazelnut|Nocciola|||
SESAME|سمسم|Sesame|Sesamo|||
RICE|أرز|Rice|Riso|رز||
LENTIL|عدس|Lentil|Lenticchia|عدس اصفر|Lentils|Lenticchie
CHICKPEA|حمص حب|Chickpea|Cece|حمص ناشف|Chickpeas|Ceci
BEAN|فاصوليا|Bean|Fagiolo|فاصوليا ناشفة|Beans|Fagioli
FLOUR|دقيق|Flour|Farina|||
SUGAR|سكر|Sugar|Zucchero|||
SALT|ملح|Salt|Sale|||
BLACK_PEPPER|فلفل أسود|Black pepper|Pepe nero|||
CINNAMON|قرفة|Cinnamon|Cannella|||
GINGER|زنجبيل|Ginger|Zenzero|||
SAFFRON|زعفران|Saffron|Zafferano|||
`,
  PREPARATION: String.raw`
GRILLED|مشوي|Grilled|Alla griglia|مشوية|Grill|Grigliato
FRIED|مقلي|Fried|Fritto|مقلية||
DEEP_FRIED|غزير الزيت|Deep fried|Fritto in immersione|مقلي عميق||
ROASTED|محمر|Roasted|Arrosto|روستو||
BAKED|مخبوز|Baked|Al forno|في الفرن||
STEAMED|على البخار|Steamed|Al vapore|||
BOILED|مسلوق|Boiled|Bollito|||
SMOKED|مدخن|Smoked|Affumicato|||
BRAISED|مطهو ببطء|Braised|Brasato|||
SAUTEED|سوتيه|Sautéed|Saltato in padella|||
CRISPY|كرسبي|Crispy|Croccante|مقرمش|Crunchy|
SPICY|حار|Spicy|Piccante|سبايسي||
CREAMY|كريمي|Creamy|Cremoso|بالكريمة||
STUFFED|محشي|Stuffed|Ripieno|محشية||
MARINATED|متبل|Marinated|Marinato|||
SLICED|شرائح|Sliced|Affettato|مقطع شرائح||
MINCED|مفروم|Minced|Tritato|مفرومة||
BREADED|بانيه|Breaded|Impanato|مغلف بالبقسماط||
PLAIN|سادة|Plain|Semplice|بدون إضافات||
`,
  SAUCE: String.raw`
KETCHUP|كاتشب|Ketchup|Ketchup|||
MAYONNAISE|مايونيز|Mayonnaise|Maionese|مايونيز||
MUSTARD|مستردة|Mustard|Senape|خردل||
BBQ_SAUCE|صوص باربكيو|Barbecue sauce|Salsa barbecue|صوص باربيكيو|BBQ sauce|
HOT_SAUCE|صوص حار|Hot sauce|Salsa piccante|شطة سائلة||
TAHINI|طحينة|Tahini|Tahina|||
GARLIC_SAUCE|صوص ثوم|Garlic sauce|Salsa all'aglio|تومية||
PESTO|بيستو|Pesto|Pesto|||
TOMATO_SAUCE|صلصة طماطم|Tomato sauce|Salsa di pomodoro|صوص طماطم||
ALFREDO_SAUCE|صوص ألفريدو|Alfredo sauce|Salsa Alfredo|||
BOLOGNESE_SAUCE|صوص بولونيز|Bolognese sauce|Ragù alla bolognese|راجو بولونيز||
RANCH_SAUCE|صوص رانش|Ranch sauce|Salsa ranch|||
CAESAR_DRESSING|صوص سيزر|Caesar dressing|Salsa Caesar|||
TERIYAKI|صوص ترياكي|Teriyaki sauce|Salsa teriyaki|||
HONEY_MUSTARD|هاني ماسترد|Honey mustard|Salsa senape e miele|||
CHOCOLATE_SAUCE|صوص شوكولاتة|Chocolate sauce|Salsa al cioccolato|||
CARAMEL_SAUCE|صوص كراميل|Caramel sauce|Salsa al caramello|||
BESHAMEL|بشاميل|Béchamel|Besciamella|||
TZATZIKI|تزاتزيكي|Tzatziki|Tzatziki|||
HARISSA|هريسة حارة|Harissa|Harissa|||
SWEET_CHILI|سويت تشيلي|Sweet chili sauce|Salsa agrodolce piccante|||
DYNAMITE_SAUCE|صوص دايناميت|Dynamite sauce|Salsa dynamite|||
`,
  BAKERY: String.raw`
BREAD|عيش|Bread|Pane|خبز||
BAGUETTE|باجيت|Baguette|Baguette|||
PITA|عيش بلدي|Pita bread|Pane pita|خبز عربي|Pita|
TORTILLA|تورتيلا|Tortilla|Tortilla|||
BURGER_BUN|عيش برجر|Burger bun|Panino per hamburger|خبز برجر||
BRIOCHE|بريوش|Brioche|Brioche|||
SOURDOUGH|ساوردو|Sourdough|Pane a lievitazione naturale|خبز ساوردو||
FOCACCIA|فوكاتشيا|Focaccia|Focaccia|||
PRETZEL|بريتزل|Pretzel|Brezel|||
BREADSTICKS|أعواد خبز|Breadsticks|Grissini|جريسيني||
TOAST_BREAD|توست|Toast bread|Pane da toast|||
WHITE_BREAD|عيش أبيض|White bread|Pane bianco|خبز أبيض||
WHOLE_WHEAT_BREAD|عيش قمح كامل|Whole wheat bread|Pane integrale|خبز أسمر||
MULTIGRAIN_BREAD|خبز حبوب متعددة|Multigrain bread|Pane multicereali|||
FLATBREAD|خبز مسطح|Flatbread|Pane piatto|||
KA_AK|كعك|Kaak bread|Pane kaak|||
FATEER|فطير مشلتت|Feteer meshaltet|Feteer meshaltet|فطير||
CROISSANT|كرواسون|Croissant|Cornetto|كرواسان||
DANISH_PASTRY|دانش|Danish pastry|Pasta danese|||
PIZZA_DOUGH|عجينة بيتزا|Pizza dough|Impasto per pizza|||
BREAD_ROLL|رول خبز|Bread roll|Panino morbido|||
`,
  PORTION: String.raw`
CAKE_SLICE|قطعة كيك|Cake slice|Fetta di torta|شريحة كيك||
WHOLE_CAKE|تورتة كاملة|Whole cake|Torta intera|كيكة كاملة||
MIXED_SWEETS_BOX|علبة حلويات مشكلة|Assorted sweets box|Scatola di dolci misti|بوكس حلويات||
GIFT_BOX|علبة هدايا|Gift box|Confezione regalo|بوكس هدايا||
FAMILY_TRAY|صينية عائلية|Family tray|Vassoio famiglia|||
SINGLE_PORTION|وجبة فردية|Single portion|Porzione singola|||
FAMILY_PORTION|وجبة عائلية|Family portion|Porzione famiglia|||
MEAT_TRAY|صينية لحوم|Meat tray|Vassoio di carne|||
PASTRY_BOX|علبة معجنات|Pastry box|Scatola di pasticcini|||
DESSERT_CUP|كوب حلوى|Dessert cup|Bicchierino dessert|||
`,
};

const rows = (group: TagGroup, source: string): FoodTagSeed[] =>
  source
    .trim()
    .split('\n')
    .map((line) => {
      const [code, nameAr, nameEn, nameIt, ar = '', en = '', it = ''] =
        line.split('|');
      if (
        !code ||
        !nameAr ||
        !nameEn ||
        !nameIt ||
        !/^[A-Z][A-Z_0-9]*$/.test(code)
      ) {
        throw new Error(`Invalid catalog row: ${line}`);
      }
      const split = (value: string) =>
        value
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean);
      return {
        code,
        group,
        nameAr,
        nameEn,
        nameIt,
        aliases: {
          ar: [nameAr, ...split(ar)],
          en: [nameEn, ...split(en)],
          it: [nameIt, ...split(it)],
        },
      };
    });

export const FOOD_TAG_CATALOG: FoodTagSeed[] = Object.entries(DATA).flatMap(
  ([group, value]) => rows(group as TagGroup, value),
);

/** Discovery only; never a rule for automatically annotating a photo or setting RAW/COOKED. */
export const FOOD_TAG_RELATIONS: ReadonlyArray<readonly [string, string]> = [
  ['BEEF', 'GROUND_BEEF'],
  ['BEEF', 'BEEF_CUBES'],
  ['BEEF', 'RIBEYE'],
  ['BEEF', 'BRISKET'],
  ['BEEF', 'BEEF_LIVER'],
  ['BEEF', 'BEEF_RIBS'],
  ['BEEF', 'TENDERLOIN'],
  ['LAMB', 'LAMB_CHOPS'],
  ['LAMB', 'LAMB_SHANK'],
  ['LAMB', 'GROUND_LAMB'],
  ['CHICKEN', 'CHICKEN_BREAST'],
  ['CHICKEN', 'CHICKEN_THIGH'],
  ['CHICKEN', 'CHICKEN_WINGS'],
  ['CHICKEN', 'WHOLE_CHICKEN'],
  ['CHICKEN', 'CHICKEN_FILLET'],
  ['CHICKEN', 'CHICKEN_LIVER'],
  ['SHRIMP', 'PEELED_SHRIMP'],
  ['FISH', 'FISH_FILLET'],
  ['FISH', 'WHOLE_FISH'],
  ['BURGER', 'CHEESEBURGER'],
  ['BURGER', 'BURGER_BUN'],
  ['PIZZA', 'MARGHERITA_PIZZA'],
  ['PIZZA', 'PEPPERONI_PIZZA'],
  ['PIZZA', 'QUATTRO_FORMAGGI'],
  ['PIZZA', 'CALZONE'],
  ['PASTA', 'SPAGHETTI'],
  ['PASTA', 'PENNE'],
  ['PASTA', 'RAVIOLI'],
  ['PASTA', 'LASAGNA'],
  ['PASTA', 'MACARONI_BESHAMEL'],
  ['CHEESE', 'MOZZARELLA'],
  ['CHEESE', 'CHEDDAR'],
  ['CHEESE', 'FETA'],
  ['CHEESE', 'BURRATA'],
  ['CHEESE', 'PARMESAN'],
  ['CAKE', 'CHOCOLATE_CAKE'],
  ['CAKE', 'CARROT_CAKE'],
  ['CAKE', 'RED_VELVET'],
  ['CAKE', 'CAKE_SLICE'],
  ['CAKE', 'WHOLE_CAKE'],
  ['CHOCOLATE', 'DARK_CHOCOLATE'],
  ['CHOCOLATE', 'WHITE_CHOCOLATE'],
  ['COFFEE', 'ESPRESSO'],
  ['COFFEE', 'AMERICANO'],
  ['COFFEE', 'CAPPUCCINO'],
  ['COFFEE', 'LATTE'],
  ['COFFEE', 'COLD_BREW'],
  ['COFFEE', 'ICED_COFFEE'],
  ['MILKSHAKE', 'CHOCOLATE_MILKSHAKE'],
  ['MILKSHAKE', 'STRAWBERRY_MILKSHAKE'],
  ['MILKSHAKE', 'VANILLA_MILKSHAKE'],
  ['TEA', 'BLACK_TEA'],
  ['TEA', 'GREEN_TEA'],
  ['BREAD', 'PITA'],
  ['BREAD', 'SOURDOUGH'],
  ['BREAD', 'BAGUETTE'],
  ['BREAD', 'BURGER_BUN'],
  ['TOMATO', 'TOMATO_SAUCE'],
  ['GARLIC', 'GARLIC_SAUCE'],
  ['MUSTARD', 'HONEY_MUSTARD'],
  ['CHOCOLATE', 'CHOCOLATE_SAUCE'],
  ['CARAMEL', 'CARAMEL_SAUCE'],
  ['BESHAMEL', 'MACARONI_BESHAMEL'],
  ['MUSHROOM', 'RISOTTO'],
  ['STUFFED', 'STUFFED_GRAPE_LEAVES'],
  ['STUFFED', 'STUFFED_CABBAGE'],
  ['STUFFED', 'STUFFED_ZUCCHINI'],
  ['STUFFED', 'STUFFED_PEPPER'],
  ['RICE', 'RICE_BOWL'],
  ['RICE', 'RICE_PILAF'],
  ['RICE', 'RICE_WITH_VERMICELLI'],
  ['LENTIL', 'LENTIL_SOUP'],
  ['CHICKPEA', 'HUMMUS'],
  ['BEEF', 'BEEF_STEW'],
  ['CHICKEN', 'CHICKEN_STEW'],
];
