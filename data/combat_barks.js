// Cosmetic combat barks. Selectors use exact unit IDs or explicit groups so
// neighboring branches never inherit one another's voice by sharing tags.
// Each group lists its complete membership; descendants are never inferred.
//
// Rules use on_hit, on_kill, on_death, on_buff, on_healed, and
// on_battle_start (the latter is used by the litany preview in battle prep).
// Dialogue rules emit one bark per speaker, actor first and target second.
// Keep English and Russian arrays aligned; paired dialogue stores each
// speaker's localized text together.

const BARK_CHANCES = {
  on_hit:    [0.30, 0.12],
  on_kill:   [0.55, 0.30],
  on_death:  [0.60, 0.00],
  on_buff:   [0.35, 0.15],
  on_healed: [0.50, 0.25],
};

const BARK_UNIT_GROUPS = {
  // Empire: ordinary soldiers and specialists.
  empire_infantry: ['e1', 'e11', 'e112', 'e113', 'e1121', 'e1131'],
  empire_crossbows: ['e111', 'e1111'],
  empire_cavalry: ['e12', 'e121', 'e1211'],
  empire_standards: ['e13', 'e131', 'e1311'],
  empire_templars: ['e21', 'e211', 'e2111', 'e21111', 'e212', 'e2121'],
  empire_priests: ['e2', 'e22', 'e221', 'e2211'],
  empire_sisters: ['e8', 'e81', 'e811', 'e8111', 'e82', 'e821', 'e8211'],
  empire_bound_sentinels: ['e3', 'e31', 'e311', 'e3111'],
  empire_bound_siege: ['e32', 'e321', 'e3211'],
  empire_smiths: ['e6', 'e61', 'e611', 'e6111', 'e6112'],
  empire_riflemen: ['e62', 'e621', 'e6211'],
  empire_flamers: ['e622', 'e6221'],
  empire_hallowed_dead: ['e7', 'e71', 'e711', 'e7111', 'e222', 'e2221'],
  empire_red_magi: ['e4', 'e41', 'e411', 'e4111'],
  empire_cinder_blades: ['e412', 'e4121'],
  empire_frost_magi: ['e42', 'e421', 'e4211'],
  empire_ward_magi: ['e43', 'e431', 'e4311', 'e432', 'e4321'],

  // Grail of Sorrow: each family carries a distinct part of the spell's cost.
  grail_risen: ['gs1', 'gs11'],
  grail_plague_knights: ['gs111', 'gs1111'],
  grail_ghouls: ['gs12', 'gs121', 'gs1211'],
  grail_menders: ['gs13', 'gs131', 'gs1311', 'gs32', 'gs321', 'gs3211', 'gs33', 'gs331', 'gs3311'],
  grail_blood_adepts: ['gs31'],
  grail_blood_knights: ['gs311', 'gs3111'],
  grail_blood_magi: ['gs312', 'gs3121'],
  grail_adept: ['gs3'],
  grail_communicants: ['gs2', 'gs21', 'gs211', 'gs2111', 'gs2112'],
  grail_colossus: ['gs4'],
  grail_seraphs: ['gs41', 'gs411', 'gs4111'],
  grail_sorrow_vessels: ['gs42', 'gs421', 'gs4211'],
  grail_acolytes: ['gs5', 'gs51', 'gs511', 'gs5111', 'gs52', 'gs521', 'gs5211'],
  grail_ghosts: ['gs6', 'gs61', 'gs611', 'gs6111', 'gs62', 'gs621', 'gs6211', 'gs622', 'gs6221'],
  grail_pale_sisters: ['gs7', 'gs71', 'gs711', 'gs7111', 'gs72', 'gs721', 'gs7211', 'gs73', 'gs731', 'gs7311'],
  grail_mothers: ['gs8', 'gs81', 'gs811', 'gs8111', 'gs82', 'gs821', 'gs8211', 'gs83', 'gs831', 'gs8311'],

  // Choir of the Cursed: appetite, court, and the First Song's many forms.
  choir_imps: ['d1', 'd11', 'd111', 'd1111', 'd1112'],
  choir_choristers: ['d12', 'd121', 'd1211', 'd1212'],
  choir_ash_priests: ['d2', 'd21', 'd211', 'd2111', 'd2112'],
  choir_gargoyles: ['d3', 'd31', 'd311', 'd3111', 'd32', 'd321', 'd3211', 'd3212', 'd33', 'd331', 'd3311'],
  choir_heretics: ['d4', 'd41', 'd411', 'd4111', 'd412', 'd4121'],
  choir_court: ['d6', 'd61', 'd611', 'd6111', 'd62', 'd621', 'd6211', 'd6212'],
  choir_fire: ['d7', 'd71', 'd711', 'd7111', 'd72', 'd721', 'd7211'],
  choir_followers: ['d5', 'd51', 'd511', 'd5111'],
  choir_cantors: ['d52', 'd521', 'd5211'],

  // Embark encounters use separate definition IDs from player rosters.
  basilica_enemies: [
    'opb_e1', 'opb_e2', 'opb_e3', 'opb_e21', 'opb_e5', 'opb_e11',
    'opb_e41', 'opb_e31', 'opb_e51', 'opb_e311', 'opb_e411', 'opb_e111',
    'opb_e211', 'opb_e212', 'opb_e3112', 'opb_e511', 'crimson_inquisitor',
  ],
  abyss_enemies: [
    'mv_e3', 'mv_e2', 'mv_e1', 'mv_e4', 'mv_e21', 'mv_e31',
    'mv_e11', 'mv_e41', 'mv_e311', 'mv_e211', 'mv_e111', 'mv_e411',
  ],
  chamber_enemies: [
    'dm_e1', 'dm_2', 'dm_e3', 'dm_e4', 'dm_e11', 'dm_e111',
    'dm_21', 'dm_e31', 'dm_e41', 'dm_211', 'dm_e311', 'dm_e411',
  ],

  // Hero branches used by the battle-prep litany toast.
  empire_hero_infantry: ['h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112', 'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212'],
  empire_hero_templar: ['h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42'],
  empire_hero_bound: ['h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42'],
  grail_hero_one: ['h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42', 'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42'],
  grail_hero_two: ['h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42'],
  grail_hero_three: ['h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42'],
  choir_hero_one: ['h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42', 'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42'],
  choir_hero_two: ['h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42'],
  choir_hero_three: ['h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42'],
};

const COMBAT_BARKS = [
  // Empire: discipline without turning every voice into the same battle cry.
  {
    trigger: 'on_hit', actor: { group: 'empire_infantry' },
    lines: ['That shield came up late.', 'You gave ground. Keep it.'],
    lines_ru: ['Щит поднят поздно.', 'Ты отступил. Так и стой.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_infantry' },
    lines: ['He will trouble no one again.', 'Mark the place. We move on.'],
    lines_ru: ['Он больше никому не повредит.', 'Запомни место. Идём дальше.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_infantry' },
    lines: ['Tell my mother I kept my word.', 'I can hear the chapel bells.'],
    lines_ru: ['Скажи матери: я сдержал слово.', 'Я слышу колокола часовни.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_crossbows' },
    lines: ['You looked the wrong way.', 'The next bolt will find the gap.'],
    lines_ru: ['Ты смотрел не туда.', 'Следующий болт найдёт брешь.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_crossbows' },
    lines: ['The distance is settled.', 'One mark removed. Reload.'],
    lines_ru: ['Дистанция больше не важна.', 'Цель снята. Перезаряжаю.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_cavalry' },
    lines: ['The earth gave way beneath you.', 'Our horses have not slowed.'],
    lines_ru: ['Земля ушла у тебя из-под ног.', 'Кони даже не замедлили шаг.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_cavalry' },
    lines: ['The road is open again.', 'Leave the fallen. We ride.'],
    lines_ru: ['Дорога снова свободна.', 'Оставь павших. Мы едем дальше.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_standards' },
    lines: ['Look up. You know where to gather.', 'The colors are still visible.'],
    lines_ru: ['Смотри выше. Ты знаешь, куда идти.', 'Знамёна всё ещё видны.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_standards' },
    lines: ['Do not let them take the colors.', 'Keep the banner from the mud.'],
    lines_ru: ['Не дай им захватить знамёна.', 'Не дай знамени упасть в грязь.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_templars' },
    lines: ['The unclean have no claim here.', 'Mithrail sees what you are.'],
    lines_ru: ['Нечисти здесь не место.', 'Митраил видит, кто ты.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_templars' },
    lines: ['Judgment needs no witness.', 'Let the ash speak for us.'],
    lines_ru: ['Приговору не нужны свидетели.', 'Пусть пепел скажет за нас.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_templars' }, target: { group: 'grail_risen' },
    lines: ['The grave called. You refused its peace.', 'Your borrowed time ends here.'],
    lines_ru: ['Могила звала. Ты отверг покой.', 'Твоё чужое время кончается здесь.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_templars' }, target: { group: 'grail_risen' },
    lines: ['The grave has claimed what is its own.', 'No more blasphemy in this place.'],
    lines_ru: ['Могила забрала то, что ей принадлежит.', 'Здесь больше нет кощунства.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_templars' },
    lines: ['The oath is not buried with me.', 'His light. My last breath.'],
    lines_ru: ['Клятву не похоронят со мной.', 'Его свет. Мой последний вздох.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'empire_sisters' }, target: { group: 'empire_templars' },
    dialogue: [
      {
        actor: { text: 'What is your duty!', text_ru: 'Каков твой долг!' },
        target: { text: 'To serve Mithrail’s will!', text_ru: 'Служить воле Митраила!' },
      },
    ],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_sisters' },
    lines: ['Your prayer was heard. Answer it.', 'Courage is not the absence of fear.'],
    lines_ru: ['Твоя молитва услышана. Ответь на неё.', 'Отвага не в том, чтобы не бояться.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'empire_sisters' }, target: { group: 'empire_templars' },
    dialogue: [
      {
        actor: { text: 'Your hand is steady again.', text_ru: 'Твоя рука снова тверда.' },
        target: { text: 'Then I have no excuse.', text_ru: 'Значит, мне не на что жаловаться.' },
      },
    ],
  },
  {
    trigger: 'on_healed', actor: { group: 'empire_priests' },
    lines: ['Breathe. The next prayer can wait.', 'There. Your hands are yours again.'],
    lines_ru: ['Дыши. Следующая молитва подождёт.', 'Вот. Руки снова слушаются.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_priests' },
    lines: ['I have said the words. Let them stand.', 'Mithrail, receive this servant.'],
    lines_ru: ['Я произнёс слова. Пусть они останутся.', 'Митраил, прими слугу Твоего.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_bound_sentinels' },
    lines: ['I remember this weight. It is welcome.', 'Stone and iron. Still, I feel the blow.'],
    lines_ru: ['Я помню эту тяжесть. Она мне знакома.', 'Камень и железо. И всё же удар чувствую.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_bound_sentinels' },
    lines: ['The living may pass in peace.', 'This place is guarded.'],
    lines_ru: ['Живые могут пройти спокойно.', 'Это место под охраной.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_bound_sentinels' },
    lines: ['The vessel falls. The oath remains.', 'I have stood watch long enough.'],
    lines_ru: ['Тело падёт. Клятва останется.', 'Я достаточно долго нёс дозор.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_bound_siege' },
    lines: ['The ground answers the shot.', 'I was built to outlast the wall.'],
    lines_ru: ['Земля отозвалась на выстрел.', 'Мне суждено пережить эту стену.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_bound_siege' },
    lines: ['The breach is wide enough.', 'The road lies open. Take it.'],
    lines_ru: ['Проход уже достаточно широк.', 'Дорога открыта. Вперёд.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_smiths' },
    lines: ['That joint will need work.', 'A good edge asks no questions.'],
    lines_ru: ['Этот шарнир придётся чинить.', 'Хорошему клинку не нужны вопросы.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_smiths' },
    lines: ['The tool held. So did I.', 'One less repair before dusk.'],
    lines_ru: ['Оружие выдержало. И я тоже.', 'До сумерек на одну починку меньше.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_riflemen' },
    lines: ['The sight picture was clean.', 'Keep your head where I can see it.'],
    lines_ru: ['Прицел был чист.', 'Не прячься от моего взгляда.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_riflemen' },
    lines: ['That is one less shot to spend.', 'The report will be brief.'],
    lines_ru: ['Одним выстрелом меньше.', 'Доклад будет коротким.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_flamers' },
    lines: ['The fire has found its work.', 'Step clear before it spreads.'],
    lines_ru: ['Огонь нашёл себе дело.', 'Отойди, пока пламя не разошлось.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_flamers' },
    lines: ['Nothing left to burn here.', 'The smoke will mark the place.'],
    lines_ru: ['Здесь больше нечего жечь.', 'Дым укажет это место.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'empire_hallowed_dead' },
    lines: ['Take the strength I no longer need.', 'A borrowed moment. Spend it well.'],
    lines_ru: ['Возьми силу, которой мне уже не нужно.', 'Мгновение взаймы. Не растрать его.'],
  },
  {
    trigger: 'on_death', actor: { group: 'empire_hallowed_dead' },
    lines: ['The watch passes to another.', 'At last, I may lay down the light.'],
    lines_ru: ['Дозор принимает другой.', 'Наконец я могу сложить этот свет.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_red_magi' },
    lines: ['Ash is what the flame leaves behind.', 'The heat has already chosen you.'],
    lines_ru: ['Пепел — всё, что оставляет пламя.', 'Жар уже выбрал тебя.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_red_magi' },
    lines: ['The cinders will cool in time.', 'The lesson is written in ash.'],
    lines_ru: ['Угли со временем остынут.', 'Урок записан пеплом.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_cinder_blades' },
    lines: ['The blade keeps its own counsel.', 'You cannot hide behind smoke.'],
    lines_ru: ['Клинок хранит свои мысли.', 'За дымом не укрыться.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'empire_frost_magi' },
    lines: ['The cold makes no distinction.', 'Your next breath will be harder.'],
    lines_ru: ['Холоду всё равно, кто перед ним.', 'Следующий вдох дастся труднее.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'empire_frost_magi' },
    lines: ['The frost keeps what it takes.', 'Let winter finish the silence.'],
    lines_ru: ['Мороз хранит всё, что забирает.', 'Пусть зима довершит тишину.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'empire_ward_magi' },
    lines: ['The ward is yours. Do not waste it.', 'Stand within the mark I made.'],
    lines_ru: ['Защита твоя. Не растрать её.', 'Останься внутри начертанного знака.'],
  },

  // Grail of Sorrow: grief is for their own mistake; Astaloth shelters, never harms.
  {
    trigger: 'on_hit', actor: { group: 'grail_risen' },
    lines: ['Cold... in the bones...', 'We came... too late...'],
    lines_ru: ['Холод... в костях...', 'Мы пришли... слишком поздно...'],
  },
  {
    trigger: 'on_kill', actor: { group: 'grail_risen' },
    lines: ['Down... stay...', 'The ground... is kind...'],
    lines_ru: ['Лежи... тихо...', 'Земля... добра...'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_risen' },
    lines: ['Rest... has found me...', 'Mother... I am tired...'],
    lines_ru: ['Покой... нашёл меня...', 'Мать... я устал...'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_plague_knights' },
    lines: ['This body failed. My purpose did not.', 'I remember the oath beneath the rot.'],
    lines_ru: ['Тело подвело. Моё дело — нет.', 'Под гнилью я помню клятву.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'grail_plague_knights' },
    lines: ['The wound is closed. Rest now.', 'I know the ground is cold.'],
    lines_ru: ['Рана закрыта. Теперь покойся.', 'Я знаю, как холодна земля.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_ghouls' },
    lines: ['I remember having a face.', 'Do not look away. I cannot.'],
    lines_ru: ['Я помню, что у меня было лицо.', 'Не отворачивайся. Я не могу.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'grail_ghouls' },
    lines: ['You will not wake in this shape.', 'May your last thought be warm.'],
    lines_ru: ['Ты не проснёшься в таком теле.', 'Пусть последняя мысль будет тёплой.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_menders' },
    lines: ['Hold still. I can make this bearable.', 'I know what the spell leaves behind.'],
    lines_ru: ['Не двигайся. Я облегчу твою участь.', 'Я знаю, что оставляет это заклятие.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'grail_menders' },
    lines: ['There. You can carry it a little longer.', 'Mother keeps watch while I work.'],
    lines_ru: ['Вот. Ты продержишься ещё немного.', 'Мать присмотрит, пока я работаю.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_menders' },
    lines: ['I could not mend what we broke.', 'Mother, keep them when I cannot.'],
    lines_ru: ['Я не смог исцелить то, что мы сломали.', 'Мать, храни их, когда я не смогу.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_blood_knights' },
    lines: ['You still have warmth to lose.', 'I remember the weight of a living heart.'],
    lines_ru: ['Тебе ещё есть что потерять.', 'Я помню, как билось живое сердце.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'grail_blood_knights' },
    lines: ['I envy the rest you have found.', 'Forgive me. I remember being you.'],
    lines_ru: ['Я завидую покою, который ты обрёл.', 'Прости. Я помню, как был таким, как ты.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_blood_adepts' },
    lines: ['The spell changed me before I could choose.', 'I remember the blood as warmth.'],
    lines_ru: ['Заклятие изменило меня прежде, чем я выбрал.', 'Я помню кровь тёплой.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_blood_magi' },
    lines: ['The spell is still unfinished in me.', 'I can feel the years slipping past.'],
    lines_ru: ['Заклятие во мне всё ещё не завершено.', 'Я чувствую, как уходят годы.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_blood_magi' },
    lines: ['I know where the translation failed.', 'Mother, let the others remember.'],
    lines_ru: ['Я знаю, где ошибся перевод.', 'Мать, пусть остальные помнят.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_adept' },
    lines: ['I remember the spell before the error.', 'The others chose what to become.'],
    lines_ru: ['Я помню заклятие до ошибки.', 'Остальные сами выбрали свой путь.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_adept' },
    lines: ['I was only the beginning.', 'The spell is still waiting to be understood.'],
    lines_ru: ['Я был лишь началом.', 'Заклятие всё ещё ждёт, чтобы его поняли.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'grail_communicants' },
    lines: ['Stay. I cannot lose another name.', 'Mother has not turned from us.'],
    lines_ru: ['Останься. Я не вынесу ещё одной утраты.', 'Мать не отвернулась от нас.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_communicants' },
    lines: ['Mother, I have carried them far enough.', 'Tell them I still remember home.'],
    lines_ru: ['Мать, я нёс их достаточно долго.', 'Скажи им, что я всё ещё помню дом.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_colossus' },
    lines: ['The earth remembers our passing.', 'Slowly... the years still turn...'],
    lines_ru: ['Земля помнит наш путь.', 'Медленно... годы всё ещё идут...'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_colossus' },
    lines: ['The long road... ends here...', 'Let the weight... be still...'],
    lines_ru: ['Долгая дорога... кончается здесь...', 'Пусть тяжесть... утихнет...'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_seraphs' },
    lines: ['The body failed. The mind remembers.', 'I am sorry. I cannot stop.'],
    lines_ru: ['Тело подвело. Разум помнит.', 'Прости. Я не могу остановиться.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_seraphs' },
    lines: ['Mother, I have carried this long enough.', 'At last, I can be still.'],
    lines_ru: ['Мать, я достаточно долго нёс это.', 'Наконец я могу успокоиться.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_sorrow_vessels' },
    lines: ['The spell left its mark on every one of us.', 'I carry what did not arrive whole.'],
    lines_ru: ['Заклятие оставило след на каждом из нас.', 'Я несу то, что прибыло не целым.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'grail_acolytes' },
    lines: ['Mother keeps you. I only tend the wound.', 'Borrow my hands until yours return.'],
    lines_ru: ['Мать хранит тебя. Я лишь перевязываю рану.', 'Пользуйся моими руками, пока твои не окрепнут.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_ghosts' },
    lines: ['I had a name. It began with—', 'Your blade passed through. I did not.'],
    lines_ru: ['У меня было имя. Оно начиналось на…', 'Твой клинок прошёл насквозь. А я — нет.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_ghosts' },
    lines: ['I think I can stop remembering now.', 'Was that my name? It was close.'],
    lines_ru: ['Кажется, теперь можно перестать вспоминать.', 'Это было моё имя? Почти.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_pale_sisters' },
    lines: ['I keep the vigil. You may pass.', 'This rite has no words for you.'],
    lines_ru: ['Я несу дозор. Ты можешь пройти.', 'Для тебя в этом обряде нет слов.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'grail_pale_sisters' },
    lines: ['I will speak your name before the Mother.', 'Rest. The vigil is over.'],
    lines_ru: ['Я назову тебя перед Матерью.', 'Покойся. Твой дозор окончен.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_pale_sisters' },
    lines: ['Mother, receive the vow with me.', 'The vigil passes to my sister.'],
    lines_ru: ['Мать, прими мою клятву вместе со мной.', 'Дозор принимает моя сестра.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_pale_sisters' }, target: { group: 'choir_court' },
    lines: ['I kept my vow. You will not name it yours.', 'The Mother knows who I was.'],
    lines_ru: ['Я сдержала клятву. Тебе её не присвоить.', 'Мать знает, кем я была.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'grail_mothers' },
    lines: ['This wound remembers what we lost.', 'Mother watches. I will not look away.'],
    lines_ru: ['Эта рана помнит нашу утрату.', 'Мать смотрит. Я не отвернусь.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'grail_mothers' },
    lines: ['Her shelter reaches even here.', 'Take what strength remains in me.'],
    lines_ru: ['Её защита достаёт и сюда.', 'Возьми силу, что ещё во мне осталась.'],
  },
  {
    trigger: 'on_death', actor: { group: 'grail_mothers' },
    lines: ['Mother, keep what I could not.', 'I remember the spell. I remember.'],
    lines_ru: ['Мать, сохрани то, что не сберёг я.', 'Я помню заклятие. Помню.'],
  },

  // Choir of the Cursed: cunning, predatory, and hungry for power.
  {
    trigger: 'on_hit', actor: { group: 'choir_imps' },
    lines: ['Your fear has a pleasing pitch.', 'Aggrail gave me teeth for this.'],
    lines_ru: ['Твой страх звучит сладко.', 'Агграил дал мне зубы для этого.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_imps' },
    lines: ['One voice silenced. The song grows sharper.', 'Aggraa am neee.'],
    lines_ru: ['Один голос смолк. Песнь стала острее.', 'Агграа ам нэээ.'],
  },
  {
    trigger: 'on_death', actor: { group: 'choir_imps' },
    lines: ['Aggrail, sing me back into being.', 'No. The verse promised more.'],
    lines_ru: ['Агграил, воспой меня снова.', 'Нет. В куплете обещали больше.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_choristers' },
    lines: ['Hold the note until it breaks.', 'The verse is older than your fear.'],
    lines_ru: ['Держи ноту, пока она не сорвётся.', 'Куплет старше твоего страха.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_choristers' },
    lines: ['A pause. The song continues.', 'That silence belongs to Aggrail.'],
    lines_ru: ['Пауза. Песнь продолжается.', 'Эта тишина принадлежит Агграилу.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'choir_ash_priests' },
    lines: ['Take the cinders. Leave me the flame.', 'I will make you useful yet.'],
    lines_ru: ['Забери угли. Пламя оставь мне.', 'Я ещё сделаю тебя полезным.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_ash_priests' },
    lines: ['Weakness is fuel. Let it burn.', 'I know what the fire asks.'],
    lines_ru: ['Слабость — топливо. Пусть горит.', 'Я знаю, чего требует огонь.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_ash_priests' },
    lines: ['The cinders belong to Aggrail.', 'Even ash can feed the song.'],
    lines_ru: ['Пепел принадлежит Агграилу.', 'Даже пепел питает песнь.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_gargoyles' },
    lines: ['I was carved to bar this way.', 'The stone remembers every trespass.'],
    lines_ru: ['Меня изваяли, чтобы преградить путь.', 'Камень помнит каждое вторжение.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_gargoyles' },
    lines: ['Back to the stone with you.', 'The threshold is quiet again.'],
    lines_ru: ['Возвращайся в камень.', 'У порога снова тихо.'],
  },
  {
    trigger: 'on_death', actor: { group: 'choir_gargoyles' },
    lines: ['Stone... takes me back...', 'The song... leaves the stone...'],
    lines_ru: ['Камень... принимает меня...', 'Песнь... покидает камень...'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_heretics' },
    lines: ['I mistook the song for mercy.', 'Listen. It promised me power.'],
    lines_ru: ['Я принял песнь за милость.', 'Слушай. Она обещала мне силу.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_heretics' },
    lines: ['See? The song chose me.', 'I am more than I was.'],
    lines_ru: ['Видишь? Песнь избрала меня.', 'Теперь я больше, чем прежде.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_heretics' }, target: { group: 'empire_priests' },
    lines: ['Your prayers called me lost. The song did not.', 'I have found the power you denied me.'],
    lines_ru: ['Твои молитвы сочли меня пропащим. Песнь — нет.', 'Я обрёл силу, в которой ты мне отказал.'],
  },
  {
    trigger: 'on_death', actor: { group: 'choir_heretics' },
    lines: ['Was this what the song meant?', 'I wanted to be chosen.'],
    lines_ru: ['Песнь это имела в виду?', 'Я хотел, чтобы меня избрали.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_court' },
    lines: ['The Court will remember this insult.', 'You stand beneath a stolen title.'],
    lines_ru: ['Двор запомнит это оскорбление.', 'Ты стоишь под чужим титулом.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_court' },
    lines: ['The Court has heard its answer.', 'Your place is beneath the dais.'],
    lines_ru: ['Двор услышал ответ.', 'Твоё место — под помостом.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_court' }, target: { group: 'empire_standards' },
    lines: ['Your colors fall like every borrowed crown.', 'No banner can command the First Song.'],
    lines_ru: ['Твои цвета падут, как всякая чужая корона.', 'Ни одно знамя не повелевает Первой Песнью.'],
  },
  {
    trigger: 'on_death', actor: { group: 'choir_court' },
    lines: ['Tell the Court I kept my name.', 'I was a peer before the song.'],
    lines_ru: ['Скажи Двору: я сохранил своё имя.', 'До песен я был пэром.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_fire' },
    lines: ['The flame wants more than you.', 'Your scream will feed the next verse.'],
    lines_ru: ['Пламени нужно больше, чем ты.', 'Твой крик накормит следующий куплет.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_fire' },
    lines: ['The fire has swallowed its measure.', 'Still hungry. Always hungry.'],
    lines_ru: ['Огонь поглотил свою меру.', 'Всё ещё голоден. Всегда голоден.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_followers' },
    lines: ['We heard the First Song before you.', 'The old court kneels to a new voice.'],
    lines_ru: ['Мы услышали Первую Песнь раньше тебя.', 'Старый двор склоняется новому голосу.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_followers' },
    lines: ['The First Song takes another voice.', 'Hear how the chorus opens.'],
    lines_ru: ['Первая Песнь принимает ещё один голос.', 'Слышишь, как раскрывается хор?'],
  },
  {
    trigger: 'on_death', actor: { group: 'choir_followers' },
    lines: ['I gave it everything. It wanted more.', 'Aggrail, hear what remains of me.'],
    lines_ru: ['Я отдал всё. Ей было мало.', 'Агграил, услышь то, что от меня осталось.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'choir_cantors' },
    lines: ['I keep the note until it cuts.', 'The verse was old before you feared it.'],
    lines_ru: ['Я держу ноту, пока она не режет.', 'Куплет был стар до того, как ты испугался.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'choir_cantors' },
    lines: ['The silence belongs to Aggrail.', 'A pause. The song goes on.'],
    lines_ru: ['Тишина принадлежит Агграилу.', 'Пауза. Песнь идёт дальше.'],
  },

  // Embark enemies speak in the language of their region.
  {
    trigger: 'on_hit', actor: { group: 'basilica_enemies' },
    lines: ['Aggrail sees your weakness.', 'Bleed. The Basilica is watching.'],
    lines_ru: ['Агграил видит твою слабость.', 'Кровоточишь. Базилика наблюдает.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'basilica_enemies' },
    lines: ['Another soul for the altar.', 'Your blood joins the holy tide.'],
    lines_ru: ['Ещё одна душа для алтаря.', 'Твоя кровь влилась в святой поток.'],
  },
  {
    trigger: 'on_death', actor: { group: 'basilica_enemies' },
    lines: ['Aggrail, take what remains.', 'My blood was always yours.'],
    lines_ru: ['Агграил, забери остатки.', 'Моя кровь всегда принадлежала тебе.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'basilica_enemies' },
    lines: ['The blood oath binds us.', 'Stand fast. Aggrail grants us strength.'],
    lines_ru: ['Кровавая клятва связывает нас.', 'Держись. Агграил дарует нам силу.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'basilica_enemies' },
    lines: ['The blood returns to its vessel.', 'Aggrail has not finished with me.'],
    lines_ru: ['Кровь возвращается в сосуд.', 'Агграил ещё не окончил со мной.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'abyss_enemies' },
    lines: ['The cold has claimed warmer hearts.', 'Your flame gutters in the deep.'],
    lines_ru: ['Холод погасил сердца горячее.', 'Твой огонь меркнет в глубине.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'abyss_enemies' },
    lines: ['The deep keeps what it takes.', 'One more glint beneath the ice.'],
    lines_ru: ['Бездна хранит добытое.', 'Ещё один отблеск подо льдом.'],
  },
  {
    trigger: 'on_death', actor: { group: 'abyss_enemies' },
    lines: ['Let the crystal keep my shape.', 'I return to the frozen dark.'],
    lines_ru: ['Пусть кристалл сохранит мой облик.', 'Я возвращаюсь в ледяную тьму.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'abyss_enemies' },
    lines: ['The crystal answers our call.', 'Hold fast. The frost will shield you.'],
    lines_ru: ['Кристалл отвечает на зов.', 'Держись. Иней защитит тебя.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'abyss_enemies' },
    lines: ['The crystal knits what was broken.', 'Cold gathers. I endure.'],
    lines_ru: ['Кристалл сращивает осколки.', 'Холод крепнет. Я держусь.'],
  },
  {
    trigger: 'on_hit', actor: { group: 'chamber_enemies' },
    lines: ['The grave has room for you.', 'Your living breath offends the dead.'],
    lines_ru: ['В могиле найдётся место и тебе.', 'Твоё дыхание оскорбляет мёртвых.'],
  },
  {
    trigger: 'on_kill', actor: { group: 'chamber_enemies' },
    lines: ['Be still among the restless.', 'The Chamber welcomes its own.'],
    lines_ru: ['Упокойся среди неупокоенных.', 'Чертог принимает своих.'],
  },
  {
    trigger: 'on_death', actor: { group: 'chamber_enemies' },
    lines: ['The vow outlives this husk.', 'Back to the dark between bells.'],
    lines_ru: ['Клятва переживёт эту оболочку.', 'Назад во тьму меж колоколов.'],
  },
  {
    trigger: 'on_buff', actor: { group: 'chamber_enemies' },
    lines: ['The oath binds bone to bone.', 'Rise. The vow is not yet paid.'],
    lines_ru: ['Клятва сковывает кость с костью.', 'Восстань. Долг ещё не уплачен.'],
  },
  {
    trigger: 'on_healed', actor: { group: 'chamber_enemies' },
    lines: ['The grave rejects me once more.', 'Death must wait at the threshold.'],
    lines_ru: ['Могила вновь отвергает меня.', 'Смерти придётся ждать у порога.'],
  },

  // Hero voice for the prep-screen litany toast; these are branch-specific.
  {
    trigger: 'on_battle_start', actor: { group: 'empire_hero_infantry' },
    lines: ['Keep your shield near mine.', 'We have come too far to scatter.'],
    lines_ru: ['Держи щит рядом с моим.', 'Мы слишком далеко зашли, чтобы отступить.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'empire_hero_templar' },
    lines: ['The unclean will not leave this field.', 'Mithrail, witness what we do.'],
    lines_ru: ['Нечисть не уйдёт отсюда.', 'Митраил, будь свидетелем наших дел.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'empire_hero_bound' },
    lines: ['I have worn another body. I remember.', 'Let the weight fall where it must.'],
    lines_ru: ['Я носил другое тело. Я помню.', 'Пусть тяжесть ляжет на меня.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'grail_hero_one' },
    lines: ['We know what the spell cost.', 'Mother, keep our names.'],
    lines_ru: ['Мы знаем цену заклятия.', 'Мать, сохрани наши имена.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'grail_hero_two' },
    lines: ['We will not forget the error.', 'There is still time to protect them.'],
    lines_ru: ['Мы не забудем нашу ошибку.', 'Ещё есть время защитить их.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'grail_hero_three' },
    lines: ['I remember warmth. I remember enough.', 'Mother walks beside us.'],
    lines_ru: ['Я помню тепло. Этого достаточно.', 'Мать идёт рядом с нами.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'choir_hero_one' },
    lines: ['Let the First Song hear us arrive.', 'Power belongs to the voice that takes it.'],
    lines_ru: ['Пусть Первая Песнь услышит наше приближение.', 'Сила достаётся тому, кто её забирает.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'choir_hero_two' },
    lines: ['I have chosen the verse. You are in it.', 'Aggrail, sharpen every note.'],
    lines_ru: ['Я выбрал куплет. Ты в нём.', 'Агграил, отточи каждую ноту.'],
  },
  {
    trigger: 'on_battle_start', actor: { group: 'choir_hero_three' },
    lines: ["Let them hear the court's true voice.", 'The chorus will not wait for them.'],
    lines_ru: ['Пусть услышат истинный голос Двора.', 'Хор не станет их ждать.'],
  },
];

const validTriggers = new Set([
  'on_hit', 'on_kill', 'on_death', 'on_buff', 'on_healed', 'on_battle_start',
]);
for (const [group, ids] of Object.entries(BARK_UNIT_GROUPS)) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) {
    throw new Error(`Invalid combat bark unit group: ${group}`);
  }
}
for (const rule of COMBAT_BARKS) {
  if (!validTriggers.has(rule.trigger)) throw new Error(`Unknown combat bark event: ${rule.trigger}`);
  if (!rule.actor) throw new Error(`Combat bark ${rule.trigger} is missing an actor selector`);
  for (const [role, selector] of Object.entries({ actor: rule.actor, target: rule.target })) {
    if (!selector) continue;
    if (Object.keys(selector).some(key => !['id', 'ids', 'group'].includes(key))) {
      throw new Error(`Unsupported combat bark selector in ${rule.trigger} ${role}`);
    }
    if (selector.group && !Object.prototype.hasOwnProperty.call(BARK_UNIT_GROUPS, selector.group)) {
      throw new Error(`Unknown combat bark unit group "${selector.group}" in ${rule.trigger} ${role}`);
    }
  }
  if (rule.dialogue) {
    if (rule.lines || rule.lines_ru || !rule.dialogue.length) {
      throw new Error(`Invalid dialogue shape in ${rule.trigger} combat bark`);
    }
    for (const exchange of rule.dialogue) {
      for (const speaker of ['actor', 'target']) {
        if (!exchange[speaker]?.text || !exchange[speaker]?.text_ru ||
            exchange[speaker].text.length > 60 || exchange[speaker].text_ru.length > 65) {
          throw new Error(`Incomplete ${speaker} text in ${rule.trigger} dialogue`);
        }
      }
    }
  } else if (!Array.isArray(rule.lines) || !rule.lines.length ||
             rule.lines.length !== rule.lines_ru?.length ||
             rule.lines.some((line, index) =>
               !line || !rule.lines_ru[index] || line.length > 60 || rule.lines_ru[index].length > 65)) {
    throw new Error(`Unpaired localized lines in ${rule.trigger} combat bark`);
  }
}

export { COMBAT_BARKS, BARK_CHANCES, BARK_UNIT_GROUPS };
