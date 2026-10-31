/* Voice Guru - content: levels/exercises, tutor guidance, diet, scenarios, tongue-twisters,
   and the Ask knowledge base. Two languages only: Hinglish (hi, Roman) and English (en).
   No Devanagari anywhere. */
(function () {
  "use strict";

  const LEVELS = [
    { n: 1, id: "warmup", title: { en: "Warm-up & Breathing", hi: "Warm-up & Saans" },
      goal: { en: "Steady breath is the base of a clear, strong voice.",
              hi: "Steady saans hi saaf aur mazboot awaaz ki neenv hai." },
      ex: [
        { type: "breathing", seconds: 40, sketch: "belly", title: { en: "Belly breathing", hi: "Pet se saans" },
          say: { en: "Sit straight. Breathe in through the nose 4 counts, hold 2, out slowly 6. Hand on belly - belly should rise, not shoulders.",
                 hi: "Seedhe baitho. Naak se 4 count saans lo, 2 roko, 6 mein dheere chhodo. Haath pet par - pet uthe, kandhe nahi." } },
        { type: "sustain", sketch: "posture", title: { en: "Hold 'Aaa'", hi: "'Aaa' tikao" },
          say: { en: "Take a deep breath and say 'Aaa' steady and even for as long as you can.",
                 hi: "Gehri saans lekar 'Aaa' ko jitni der ho sake steady, ek-sa bolo." },
          test: true, target: { sustainSec: 6, tremorMax: 0.08 },
          tip: { en: "Keep volume even. No shaking.", hi: "Awaaz ek-si rakho, kaanpe nahi." } },
      ] },
    { n: 2, id: "clarity", title: { en: "Clarity & Articulation", hi: "Saaf uchcharan" },
      goal: { en: "Open your mouth more, hit every sound - slow = clear.",
              hi: "Muuh zyada kholo, har sound saaf bolo - dheere = saaf." },
      ex: [
        { type: "articulate", title: { en: "Tongue-twister (English)", hi: "Tongue-twister (English)" },
          read: "Red lorry, yellow lorry, red lorry, yellow lorry.",
          say: { en: "Read 3 times, slowly and clearly. Every word crisp.",
                 hi: "3 baar padho, dheere aur saaf. Har shabd kurkura." } },
        { type: "articulate", title: { en: "Tongue-twister (Hinglish)", hi: "Tongue-twister (Hinglish)" },
          read: "Kachcha papad, pakka papad. Kachcha papad, pakka papad.",
          say: { en: "Read clearly, do not rush.", hi: "Saaf padho, jaldbaazi nahi." } },
        { type: "articulate", sketch: "openmouth", title: { en: "Clear reading test", hi: "Saaf padhne ka test" },
          read: "The quick brown fox jumps over the lazy dog near the river bank.",
          say: { en: "Read once, clearly and steadily.", hi: "Ek baar, saaf aur steady padho." },
          test: true, target: { speakingRatioMin: 0.45, pausesMax: 4 },
          tip: { en: "Don't mumble, don't rush.", hi: "Na budbudao, na bhaago." } },
      ] },
    { n: 3, id: "pace", title: { en: "Pace & Pauses", hi: "Pace aur Pauses" },
      goal: { en: "Slower speech with small pauses sounds confident and is easy to follow.",
              hi: "Thoda dheere bolna aur chhote pause - confident lagta hai aur samajh aata hai." },
      ex: [
        { type: "pace", sketch: "pace", title: { en: "Slow, paced reading", hi: "Dheemi, thehri padhai" },
          read: "Good morning. My name is Akash. I work as a software developer, and I am learning AI and machine learning.",
          say: { en: "Read slowly. Pause at each full stop. Breathe at pauses.",
                 hi: "Dheere padho. Har full stop par ruko. Rukte waqt saans lo." },
          test: true, target: { speakingRatioMax: 0.9, pausesMin: 1 },
          tip: { en: "Pauses are good - they are not mistakes.", hi: "Rukna achha hai, galti nahi." } },
      ] },
    { n: 4, id: "pitch", title: { en: "Pitch & Expression", hi: "Sur aur Bhaav" },
      goal: { en: "A voice that moves up and down holds attention. Monotone sounds flat.",
              hi: "Upar-neeche hoti awaaz dhyaan kheenchti hai. Ek-sur (monotone) sapaat lagta hai." },
      ex: [
        { type: "pitch", sketch: "wave", title: { en: "Pitch glide", hi: "Sur glide" },
          say: { en: "Say 'Aaa' and slide your voice from low to high and back, like a wave. Twice.",
                 hi: "'Aaa' bolkar awaaz ko neeche se upar aur wapas le jao, lehar ki tarah. Do baar." } },
        { type: "pitch", title: { en: "Expression test", hi: "Bhaav test" },
          read: "Wow, that is really amazing! Are you serious? I can't believe it!",
          say: { en: "Read with feeling - let your pitch rise and fall.",
                 hi: "Bhaav ke saath padho - sur chadhne-utarne do." },
          test: true, target: { semitoneRangeMin: 3.5 },
          tip: { en: "Don't read flat. Act a little.", hi: "Sapaat nahi, thoda acting karo." } },
      ] },
    { n: 5, id: "volume", title: { en: "Volume & Steadiness", hi: "Volume aur Steadiness" },
      goal: { en: "Speak loud enough and keep it even - don't fade at the end of sentences.",
              hi: "Kaafi zor se bolo aur ek-sa rakho - vaaky ke ant mein awaaz na girao." },
      ex: [
        { type: "confidence", title: { en: "Strong, even reading", hi: "Mazboot, ek-si padhai" },
          read: "I am confident. I speak clearly. My voice is strong and steady from the first word to the last.",
          say: { en: "Keep volume strong and even - especially the last words.",
                 hi: "Awaaz mazboot aur ek-si rakho - khaas kar aakhri shabd." },
          test: true, target: { volSteadyMin: 0.6 },
          tip: { en: "Don't trail off. Finish strong.", hi: "Ant kamzor na karo, mazbooti se khatam karo." } },
      ] },
    { n: 6, id: "accent", title: { en: "English Accent - Shadowing", hi: "English Accent - Shadowing" },
      goal: { en: "Listen to the reference, repeat it, compare. Imitation is how accent improves.",
              hi: "Reference suno, dohrao, milao. Nakal se hi accent sudharta hai." },
      ex: [
        { type: "shadow", sketch: "lipsVW", title: { en: "Sound: V vs W", hi: "Sound: V vs W" },
          read: "very wet, vine wine, vest west",
          say: { en: "Tap 'Listen', then repeat. V = teeth on lip; W = round lips.",
                 hi: "'Listen' dabao, phir dohrao. V = daant honth par; W = honth gol." } },
        { type: "shadow", sketch: "tongueTH", title: { en: "Sound: TH", hi: "Sound: TH" },
          read: "think this that three mother brother",
          say: { en: "Tongue lightly between teeth for 'th'. Listen and repeat.",
                 hi: "'th' ke liye jeebh daanton ke beech halki. Suno aur dohrao." } },
        { type: "shadow", title: { en: "Word stress", hi: "Word stress" },
          read: "PHOtograph, phoTOgrapher, comPUter, inforMAtion",
          say: { en: "Stress the CAPITAL part harder. Listen and copy the rhythm.",
                 hi: "Bade akshar wale hisse par zor. Sunkar rhythm ki nakal karo." },
          test: true, target: { done: true },
          tip: { en: "Match the reference rhythm.", hi: "Reference ki lay se milao." } },
      ] },
  ];

  const SCENARIOS = [
    { id: "intro", title: { en: "Self-introduction", hi: "Apna parichay" },
      read: "Hello, my name is Akash Kumar. I am a software developer and I'm passionate about AI and machine learning. I enjoy building useful tools and solving real problems.",
      say: { en: "Record your intro. Speak slowly, smile, finish strong.",
             hi: "Apna parichay record karo. Dheere bolo, muskurao, mazbooti se khatam karo." } },
    { id: "phone", title: { en: "Phone conversation", hi: "Phone par baat" },
      read: "Hello, good afternoon. Thank you for calling. Yes, I can help you with that. Could you please tell me a little more?",
      say: { en: "Clear and warm. Pause after each sentence.",
             hi: "Saaf aur garmjoshi se. Har vaaky ke baad ruko." } },
    { id: "iq", title: { en: "IQ answer", hi: "IQ jawab" },
      read: "Overfitting is when a model learns the training data too well, including its noise, so it performs great on training data but poorly on new, unseen data.",
      say: { en: "Answer like in an IQ. Steady pace, confident tone.",
             hi: "IQ jaisa jawab do. Steady pace, confident tone." } },
  ];

  const TUTOR = [
    { sketch: "posture", title: { en: "How to speak well", hi: "Achha kaise bolein" }, body: {
      hi: "Seedhe baitho/khade ho, kandhe dheele. Saans pet se lo. Thoda dheere bolo - jaldbaazi se clarity girti hai. " +
          "Muuh poora kholo, har shabd ka ant saaf bolo. Vaaky ke beech chhote pause lo aur wahaan saans bharo. " +
          "Aankh milao aur halka muskurao - awaaz apne-aap garm lagti hai.",
      en: "Sit/stand straight, shoulders relaxed. Breathe from the belly. Speak a little slowly - " +
          "rushing kills clarity. Open your mouth fully, finish each word. Take small pauses and breathe there. " +
          "Make eye contact and smile slightly - the voice warms up on its own." } },
    { title: { en: "Before practice / speaking", hi: "Abhyaas/bolne se pehle" }, body: {
      hi: "Pet halka rakho - bhaari ya tala khaana theek pehle nahi (gale aur saans par dabaav). Gunguna paani piyo. " +
          "1-2 minute saans aur 'Aaa' wala warm-up karo. Bahut thanda paani, ice-cream, cold drinks se bacho.",
      en: "Keep the stomach light - no heavy/fried food right before (it presses the throat and breath). " +
          "Sip warm water. Do 1-2 minutes of breathing and 'Aaa' warm-up. Avoid very cold water, ice-cream, cold drinks." } },
    { title: { en: "After practice", hi: "Abhyaas ke baad" }, body: {
      hi: "Gala garm rakho, turant thanda paani nahi. Halki humming se cool-down karo. Zyada zor/chillane se thaka ho to aaram do.",
      en: "Keep the throat warm, no cold water right away. Cool down with light humming. If tired from loud use, rest the voice." } },
    { title: { en: "Daily voice habits", hi: "Roz ki aadtein" }, body: {
      hi: "Dinbhar khoob paani (hydration awaaz ka #1 dost). Poori neend. Dhoomrapaan bilkul nahi. Zyada chai-coffee aur " +
          "bahut khatta/teekha kam (acid se gala kharab). Roz 10 minute abhyaas - nirantarta sabse zyada kaam aati hai.",
      en: "Plenty of water all day (hydration is the voice's #1 friend). Full sleep. No smoking. Limit " +
          "excess tea/coffee and very sour/spicy food (acid harms the throat). 10 minutes daily - consistency wins." } },
  ];

  const DIET = [
    { food: { en: "Warm water + honey", hi: "Gunguna paani + shahad" }, note: { en: "Soothes and clears the throat.", hi: "Gala saaf aur naram rakhta hai." }, good: true },
    { food: { en: "Ginger / herbal tea", hi: "Adrak / herbal chai" }, note: { en: "Warm, clears mucus.", hi: "Garam, balgam saaf." }, good: true },
    { food: { en: "Water-rich fruits", hi: "Paani wale fal" }, note: { en: "Hydration + vitamins.", hi: "Paani aur vitamin." }, good: true },
    { food: { en: "Warm soup", hi: "Garam soup" }, note: { en: "Gentle on the throat.", hi: "Gale par naram." }, good: true },
    { food: { en: "Cold water / ice-cream (before speaking)", hi: "Thanda paani / ice-cream (bolne se pehle)" }, note: { en: "Tightens the throat.", hi: "Gala jakadta hai." }, good: false },
    { food: { en: "Heavy dairy before practice", hi: "Abhyaas se pehle zyada doodh/cheese" }, note: { en: "Can increase mucus.", hi: "Balgam badha sakta hai." }, good: false },
    { food: { en: "Very spicy / fried / sour", hi: "Bahut teekha / tala / khatta" }, note: { en: "Acid reflux harms voice.", hi: "Acid se gala kharab." }, good: false },
    { food: { en: "Excess tea/coffee, alcohol, smoking", hi: "Zyada chai-coffee, sharab, dhoomrapaan" }, note: { en: "Dry out & damage the voice.", hi: "Awaaz sukhate/bigadte hain." }, good: false },
  ];

  const ASK = [
    { q: { en: "Voice shaky / trembling", hi: "Awaaz kaanpti hai" }, tags: "shaky tremor kaanp trembling weak nervous steady",
      a: { hi: "Saans kamzor hone se awaaz kaanpti hai. Roz belly-breathing (Level 1) aur 'Aaa' ko 6+ second steady tikane ka abhyaas karo. Dheere bolo.",
           en: "A shaky voice usually means weak breath support. Do daily belly-breathing (Level 1) and hold 'Aaa' steady for 6+ seconds. Speak slowly." } },
    { q: { en: "Voice too soft / not clear", hi: "Awaaz dheemi / saaf nahi" }, tags: "soft low clear mumble clarity volume dheemi",
      a: { hi: "Muuh zyada kholo, thoda dheere bolo, aur vaaky ke ant tak awaaz na girao. Level 2 (clarity) aur Level 5 (volume) karo.",
           en: "Open your mouth more, speak a bit slower, and don't drop volume at the end. Do Level 2 (clarity) and Level 5 (volume)." } },
    { q: { en: "Voice is flat / monotone", hi: "Awaaz sapaat / ek-sur" }, tags: "flat monotone boring expression pitch sur",
      a: { hi: "Level 4 (pitch) karo - pitch glide aur bhaav ke saath padhna. Sawal poochhte waqt sur upar, ant mein neeche.",
           en: "Do Level 4 (pitch) - pitch glides and reading with feeling. Raise pitch for questions, lower it to finish." } },
    { q: { en: "I speak too fast", hi: "Main bahut tez bolta hoon" }, tags: "fast speed slow pace rush tez jaldi",
      a: { hi: "Har vaaky ke baad 1 second ruko aur saans lo. Level 3 (pace) roz karo. Pause galti nahi hai.",
           en: "Pause 1 second and breathe after each sentence. Do Level 3 (pace) daily. Pauses are not mistakes." } },
    { q: { en: "Stammering / stuttering help", hi: "Haklahat mein madad" }, tags: "stammer stutter hakla repeat block fluency",
      a: { hi: "Dheere aur thoda kheench kar bolna (easy onset), saans par dhyaan, aur roz abhyaas se kaafi madad milti hai. " +
             "Sabse asardaar saath ek speech therapist (SLP) ka hota hai - yeh app roz ke abhyaas aur confidence ke liye hai.",
           en: "Speaking slowly with gentle, slightly stretched onset, focusing on breath, and daily practice help a lot. " +
             "The most effective support is a speech therapist (SLP) - this app is for daily practice and confidence." } },
    { q: { en: "Best diet for voice", hi: "Awaaz ke liye best diet" }, tags: "diet food khana eat drink water honey",
      a: { hi: "Khoob paani (gunguna best), shahad, adrak chai, paani wale fal. Bolne se pehle thanda/bhaari/tala khaana se bacho. Diet tab dekho.",
           en: "Plenty of water (warm is best), honey, ginger tea, water-rich fruits. Avoid cold/heavy/fried food before speaking. See the Diet tab." } },
    { q: { en: "How to sound confident", hi: "Confident kaise lagein" }, tags: "confident confidence strong nervous interview iq",
      a: { hi: "Dheere-saaf bolo, vaaky mazbooti se khatam karo, beech mein pause lo. Scenarios (self-intro, IQ answer) roz record karo aur apni purani recording se milao.",
           en: "Speak slowly and clearly, finish sentences strongly, use pauses. Record the Scenarios (self-intro, IQ answer) daily and compare with your older recordings." } },
    { q: { en: "English accent improve", hi: "English accent sudharna" }, tags: "accent english pronunciation shadow v w th stress",
      a: { hi: "Level 6 (shadowing) karo - reference suno, dohrao, milao. V/W, TH aur word-stress par dhyaan. Roz 5 minute.",
           en: "Do Level 6 (shadowing) - listen, repeat, compare. Focus on V/W, TH and word stress. 5 minutes daily." } },
  ];

  window.VG_CONTENT = { LEVELS: LEVELS, SCENARIOS: SCENARIOS, TUTOR: TUTOR, DIET: DIET, ASK: ASK };
})();
