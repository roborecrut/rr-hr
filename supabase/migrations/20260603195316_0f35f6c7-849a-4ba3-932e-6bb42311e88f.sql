
-- Wipe previous demo rows (cascade through candidates/projects/companies via FKs we touch explicitly)
DELETE FROM public.candidates WHERE public_id = '693126';
DELETE FROM public.projects   WHERE slug = 'sales-prod-1';
DELETE FROM public.companies  WHERE slug = 'ooo-roborekrut-inzhiniring';
DELETE FROM public.employers  WHERE public_id = 'emp-demo';

-- Re-seed with auto-generated public_id / slug (triggers fire on NULL)
DO $$
DECLARE
  v_emp_id   uuid;
  v_comp_id  uuid;
  v_proj_id  uuid;
BEGIN
  -- 1) Demo employer (no user_id; admin/anyone can view via RLS admin policy)
  INSERT INTO public.employers (company_name, contact_name, contact_email, plan, status, bonus_granted)
  VALUES ('ООО РобоРекрут инжиниринг', 'Демо HR', 'demo@hr-rr.ru', 'gold', 'active', true)
  RETURNING id INTO v_emp_id;

  -- 2) Demo company owned by demo employer
  INSERT INTO public.companies (
    owner_employer_id, name, logo_url, mission_text, about_text, team_text,
    payouts_text, schedule_text, system_text, is_published, stats
  ) VALUES (
    v_emp_id,
    'ООО РобоРекрут инжиниринг',
    'https://i.ibb.co/WWRbtPq0/RR-Logo.png',
    'Автоматизируем найм с помощью ИИ — снижаем стоимость закрытия вакансии в 5 раз.',
    'РобоРекрут — продуктовая ИИ-платформа для подбора, обучения и аттестации сотрудников. С 2023 года помогаем компаниям нанимать продавцов, операторов и менеджеров в несколько раз быстрее.',
    'Команда из 18 инженеров и HR-экспертов. Работаем удалённо, головной офис — Москва.',
    'Оклад + KPI + бонус за выполнение плана. Выплаты 2 раза в месяц на карту.',
    '5/2, гибкое начало дня с 9:00 до 11:00. Полностью удалённый формат.',
    'CRM amoCRM + телефония Mango + ИИ-ассистент RoboRecruiter в Telegram.',
    true,
    jsonb_build_object('clients','120+','dialogs','45 000+','founded','2023')
  ) RETURNING id INTO v_comp_id;

  -- 3) Demo published vacancy
  INSERT INTO public.projects (
    employer_id, company_id, role_name,
    salary_terms, schedule_terms, motivation_text,
    vacancy_text, motivation_text_detail, company_text, onboarding_text,
    payouts_text, schedule_text, team_text, system_text,
    mission_text, is_published, stats, created_tasks
  ) VALUES (
    v_emp_id, v_comp_id, 'Менеджер по продажам',
    'Оклад 60 000 ₽ + % с продаж (средний доход 120 000–180 000 ₽)',
    '5/2, удалённо, начало дня 9:00–11:00 МСК',
    'Прозрачная мотивация: вы видите свой доход в реальном времени в личном кабинете.',
    'Ищем менеджера по продажам в SaaS-продукт для HR. Работа с входящими и тёплыми лидами (B2B), сопровождение сделки от заявки до подписания договора.',
    'Без потолка по доходу. Лучшие менеджеры зарабатывают 250 000+ ₽. Бонусы за квартальный план — отдельной строкой.',
    'РобоРекрут — это ИИ-сервис автоматизации найма. 120+ компаний, 45 000+ обработанных диалогов. С 2023 года.',
    'Оформление по ТК РФ или самозанятость на выбор. Оплачиваемый испытательный срок 1 месяц.',
    'Оклад выплачивается 10-го и 25-го числа на банковскую карту. % с продаж — по факту поступления оплаты.',
    'Полностью удалённый формат. График 5/2, выходные сб/вс. Можно начинать день с 9:00 до 11:00 МСК.',
    'Прямой руководитель — РОП с 8-летним опытом в SaaS. В команде 6 менеджеров и 2 пресейла.',
    'CRM amoCRM, IP-телефония Mango Office, ИИ-ассистент RoboRecruiter подсказывает скрипты прямо во время звонка.',
    'Помогаем компаниям нанимать в 5 раз быстрее за счёт ИИ.',
    true,
    jsonb_build_object('avgIncome','150 000 ₽','plan','15 сделок/мес'),
    false
  ) RETURNING id INTO v_proj_id;

  -- 4) Demo candidate attached to that vacancy
  INSERT INTO public.candidates (
    project_id, current_stage, role_name, registered_via, landing_slug
  ) VALUES (
    v_proj_id, 'terms', 'Менеджер по продажам', 'google', 'ooo-roborekrut-inzhiniring'
  );
END $$;
