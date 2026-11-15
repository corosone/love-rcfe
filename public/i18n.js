(function () {
  'use strict';

  var STORAGE_KEY = 'lovercfe_lang';

  var LANGUAGES = {
    en: { code: 'EN', name: 'English', intl: 'en-US' },
    es: { code: 'ES', name: 'Español', intl: 'es-US' },
    zh: { code: 'ZH', name: '中文', intl: 'zh-CN' },
    tl: { code: 'TL', name: 'Tagalog', intl: 'fil-PH' },
    vi: { code: 'VI', name: 'Tiếng Việt', intl: 'vi-VN' },
    ko: { code: 'KO', name: '한국어', intl: 'ko-KR' }
  };

  // Multi-tag HTML blocks (keyed by data-i18n-block) so inline markup & word order translate naturally.
  var BLOCKS = {
    hero_title: {
      es: 'Un poco más de claridad.<br><span class="italic text-brand-green font-normal">Mucho más cuidado.</span>',
      zh: '多一份清晰指引。<br><span class="italic text-brand-green font-normal">多十分用心照护。</span>',
      tl: 'Kaunting linaw pa.<br><span class="italic text-brand-green font-normal">Mas maraming pag-aalaga.</span>',
      vi: 'Thêm một chút rõ ràng.<br><span class="italic text-brand-green font-normal">Thêm thật nhiều yêu thương.</span>',
      ko: '조금 더 선명한 안내.<br><span class="italic text-brand-green font-normal">훨씬 더 깊은 돌봄.</span>'
    },
    va_subsidy_note: {
      es: '<strong>Posible subsidio financiero (tarifas VA 2025–2026):</strong> Los veteranos solteros que califiquen pueden recibir hasta <strong>$2,431/mes</strong> (o hasta <strong>$2,881/mes</strong> con cónyuge dependiente, y hasta <strong>$1,563/mes</strong> para cónyuges sobrevivientes) mediante los beneficios de pensión VA Aid &amp; Attendance para cubrir costos mensuales de un RCFE.',
      zh: '<strong>潜在财务补助（2025–2026 年退伍军人事务部标准）：</strong> 符合条件的单身退伍军人每月最高可获 <strong>$2,431/月</strong>（有受抚养配偶最高 <strong>$2,881/月</strong>，遗属配偶最高 <strong>$1,563/月</strong>）的 VA Aid &amp; Attendance 养老金补助，用于抵扣 RCFE 月费。',
      tl: '<strong>Potensyal na Tulong Pinansyal (Mga Taripa ng VA 2025–2026):</strong> Ang mga kwalipikadong solong Beterano ay maaaring makatanggap ng hanggang <strong>$2,431/buwan</strong> (o hanggang <strong>$2,881/buwan</strong> kung may dependent na asawa, at hanggang <strong>$1,563/buwan</strong> para sa naiwang asawa) sa pamamagitan ng benepisyong pensyon ng VA Aid &amp; Attendance upang makatulong sa buwanang gastos sa RCFE.',
      vi: '<strong>Khả năng hỗ trợ tài chính (Mức VA 2025–2026):</strong> Cựu chiến binh độc thân đủ điều kiện có thể nhận tới <strong>$2,431/tháng</strong> (hoặc tới <strong>$2,881/tháng</strong> nếu có vợ/chồng phụ thuộc, và tới <strong>$1,563/tháng</strong> cho vợ/chồng còn sống) thông qua trợ cấp VA Aid &amp; Attendance để bù đắp chi phí RCFE hàng tháng.',
      ko: '<strong>재정 지원 가능액 (2025–2026년 VA 기준):</strong> 자격을 갖춘 독신 퇴역군인은 월 최대 <strong>$2,431</strong>(부양 배우자가 있는 경우 최대 <strong>$2,881</strong>, 생존 배우자는 최대 <strong>$1,563</strong>)까지 VA Aid &amp; Attendance 연금 혜택을 받아 RCFE 월 비용 부담을 줄일 수 있습니다.'
    },
    urgent_notice_p: {
      es: 'Con un plazo de transición de 1 a 7 días, las camas inmediatas y evaluaciones médicas (LIC 602A) requieren trámite urgente. Llame directamente a nuestro equipo de admisión prioritaria al <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> para vacantes hoy mismo.',
      zh: '由于转院窗口期仅有 1–7 天，急需床位与医生评估表（LIC 602A）的加急处理。请直接致电我们的优先接诊专线 <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> 查询当日空余床位。',
      tl: 'Sa palugit na 1–7 araw na paglipat, kailangang madaliin ang mga agarang kama at pagsusuri ng doktor (LIC 602A). Tumawag nang direkta sa aming priority intake team sa <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> para sa mga bakanteng slot sa parehong araw.',
      vi: 'Với thời gian chuyển tiếp gấp trong 1–7 ngày, giường trống ngay và giấy đánh giá y tế (LIC 602A) cần được xử lý khẩn. Hãy gọi trực tiếp cho đội tiếp nhận ưu tiên theo số <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> để hỏi chỗ trống trong ngày.',
      ko: '1~7일 이내의 긴급 전환 일정인 경우 즉시 입소 가능한 병상과 의사 평가서(LIC 602A)를 신속히 진행해야 합니다. 당일 공실 확인을 위해 우선 접수 팀 <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> 으로 바로 전화해 주세요.'
    },
    modal_urgent_p: {
      en: 'With an immediate 1–7 day timeframe, call our intake hotline at <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> for emergency openings and priority tour booking.',
      es: 'Con un plazo inmediato de 1 a 7 días, llame a nuestra línea prioritaria al <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> para vacantes de emergencia y visitas urgentes.',
      zh: '针对 1–7 天内的紧急入住需求，请拨打加急热线 <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> 咨询紧急空余床位与优先参观安排。',
      tl: 'Sa agarang 1–7 araw na palugit, tumawag sa aming intake hotline sa <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> para sa mga agarang bakante at mabilisang pagbisita.',
      vi: 'Với khung thời gian khẩn 1–7 ngày, hãy gọi đường dây tiếp nhận <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> để hỏi chỗ trống khẩn cấp và đặt lịch tham quan ưu tiên.',
      ko: '1~7일 이내의 긴급 입소 일정인 경우 긴급 접수 직통 <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> 으로 연락하시면 당일 공실과 우선 방문 일정을 안내해 드립니다.'
    },
    faq1_body: {
      es: 'Un <strong>RCFE (Centro Residencial para Adultos Mayores)</strong>—a menudo llamado comunidad de vivienda asistida o casa de cuidado residencial (Board &amp; Care) de 6 camas—está diseñado para personas mayores que necesitan ayuda con sus actividades diarias (alimentación, baño, vestirse, control de medicamentos) en un entorno cálido y hogareño. <br><br>Un <strong>Centro de Enfermería Especializada (SNF)</strong> es una institución médica similar a un hospital que brinda atención de enfermería con licencia las 24 horas, terapia intravenosa y cuidado de heridas agudas. Muchas familias eligen un RCFE con exención de hospicio para que sus seres queridos envejezcan en un hogar sin tener que mudarse a un asilo institucional.',
      zh: '<strong>RCFE（老年寄宿照护机构）</strong>——常被称为协助生活社区或 6 床位家庭式养老之家（Board &amp; Care）——专为在饮食、洗浴、穿衣和用药管理等日常活动方面需要协助的长者设计，提供温馨如家的居住环境。<br><br><strong>专业护理机构（SNF）</strong>则是类似医院的医疗机构，提供 24 小时持证护士护理、静脉输液和急性伤口护理。许多家庭会选择具备临终关怀豁免资质（Hospice Waiver）的 RCFE，让亲人在熟悉温暖的家庭环境中安度晚年，而不必转入传统护理院。',
      tl: 'Ang <strong>RCFE (Residential Care Facility for the Elderly)</strong>—na madalas tawaging assisted living community o 6-bed residential board &amp; care—ay idinisenyo para sa mga nakatatanda na nangangailangan ng tulong sa pang-araw-araw na gawain (pagkain, paliligo, pagbibihis, pamamahala ng gamot) sa isang mainit at parang-bahay na kapaligiran. <br><br>Ang <strong>Skilled Nursing Facility (SNF)</strong> ay isang institusyong medikal na tulad ng ospital na nagbibigay ng 24-oras na lisensyadong serbisyong pang-nars, IV therapy, at pag-aalaga sa malulubhang sugat. Maraming pamilya ang pumipili ng RCFE na may hospice waiver upang makapanatili ang kanilang mahal sa buhay hanggang sa huli nang hindi na lumilipat sa institusyonal na nursing home.',
      vi: '<strong>RCFE (Cơ sở Chăm sóc Nội trú cho Người cao tuổi)</strong>—thường được gọi là cộng đồng sinh hoạt có hỗ trợ hoặc nhà chăm sóc gia đình 6 giường (Board &amp; Care)—được thiết kế cho người cao tuổi cần hỗ trợ sinh hoạt hàng ngày (ăn uống, tắm rửa, mặc đồ, quản lý thuốc) trong môi trường ấm áp như ở nhà. <br><br><strong>Cơ sở Điều dưỡng Chuyên môn (SNF)</strong> là cơ sở y tế giống bệnh viện, cung cấp chăm sóc y tá có giấy phép 24/24, truyền dịch tĩnh mạch và chăm sóc vết thương cấp tính. Nhiều gia đình chọn RCFE có giấy miễn trừ chăm sóc cuối đời (hospice waiver) để người thân được an hưởng tuổi già tại một mái ấm quen thuộc.',
      ko: '<strong>RCFE(노인 주거 돌봄 시설)</strong>는 흔히 어시스티드 리빙 커뮤니티 또는 6인실 주거형 요양홈(Board &amp; Care)으로 불리며, 식사·목욕·옷 입기·복약 관리 등 일상생활 지원이 필요한 어르신들이 따뜻하고 가정적인 환경에서 지내실 수 있도록 마련된 곳입니다.<br><br>반면 <strong>전문간호요양시설(SNF)</strong>은 24시간 면허 간호사의 의료 돌봄, 수액 치료, 급성 상처 치료를 제공하는 병원형 의료 기관입니다. 많은 가족들이 호스피스 면제(Hospice Waiver) 승인을 받은 RCFE를 선택해 어르신이 대형 요양병원으로 옮기지 않고도 편안히 노후를 보내실 수 있도록 돕습니다.'
    },
    faq2_body: {
      es: '<strong>Medicare regular no cubre</strong> el alojamiento y comida en un RCFE (solo cubre consultas médicas, hospitalizaciones y rehabilitación especializada a corto plazo). <br><br>Sin embargo, en California, el programa <strong>Exención de Vivienda Asistida de Medi-Cal (ALW)</strong> puede cubrir la parte del cuidado en centros certificados para personas de bajos ingresos que califiquen. Además, la pensión de Veterans Aid &amp; Attendance y las pólizas de Seguro de Cuidado a Largo Plazo ayudan con frecuencia a compensar los costos. Ayudamos a las familias a evaluar estas opciones.',
      zh: '普通 <strong>Medicare（联邦医疗保险）不支付</strong> RCFE 的食宿费用（仅涵盖医生就诊、住院和短期专业康复）。<br><br>不过，在加州，<strong>Medi-Cal 协助生活豁免计划（ALW）</strong>可为符合条件的低收入人士支付经认证机构中的护理部分费用。此外，退伍军人 Aid &amp; Attendance 补助和长期护理保险（LTC）也常能大幅抵扣开支。我们会协助家庭评估这些方案。',
      tl: 'Hindi binabayaran ng regular na <strong>Medicare</strong> ang silid at pagkain sa isang RCFE (sakop lamang nito ang pagbisita sa doktor, pagka-ospital, at panandaliang skilled rehab). <br><br>Gayunpaman, sa California, ang <strong>Medi-Cal Assisted Living Waiver (ALW)</strong> ay maaaring magbayad para sa bahagi ng pag-aalaga sa mga sertipikadong pasilidad para sa mga kwalipikadong indibidwal na may mababang kita. Bukod dito, ang Veterans Aid &amp; Attendance at mga polisiya ng Long-Term Care Insurance ay madalas tumutulong upang mabawasan ang gastos. Tinutulungan namin ang mga pamilya na suriin ang mga opsyong ito.',
      vi: '<strong>Medicare thông thường không chi trả</strong> tiền phòng và ăn ở tại RCFE (chỉ chi trả khám bác sĩ, nằm viện và phục hồi chức năng ngắn hạn). <br><br>Tuy nhiên, tại California, chương trình <strong>Miễn trừ Sinh hoạt Hỗ trợ Medi-Cal (ALW)</strong> có thể chi trả phần chi phí chăm sóc tại các cơ sở được chứng nhận cho người thu nhập thấp đủ điều kiện. Ngoài ra, trợ cấp Veterans Aid &amp; Attendance và Bảo hiểm Chăm sóc Dài hạn thường giúp bù đắp chi phí. Chúng tôi hỗ trợ gia đình đánh giá các lựa chọn này.',
      ko: '일반 <strong>메디케어(Medicare)는 RCFE의 숙식 비용을 지원하지 않습니다</strong>(의사 진료, 입원, 단기 전문 재활 치료만 보장). <br><br>하지만 캘리포니아에서는 자격을 갖춘 저소득층의 경우 <strong>Medi-Cal 보조생활 면제 프로그램(ALW)</strong>을 통해 인증 시설의 돌봄 비용 일부를 지원받을 수 있습니다. 또한 보훈처 Aid &amp; Attendance 연금과 장기요양보험(LTC)도 비용 부담을 크게 덜어줍니다. 저희가 가족분들께 적합한 옵션을 함께 검토해 드립니다.'
    },
    faq3_body: {
      es: 'El plazo estándar suele ser de <strong>4 a 8 meses</strong>, según la rapidez con la que el departamento de bomberos local realice la inspección STD 850 y el volumen de trámites en la oficina regional del CDSS. Contar con un paquete LIC 200 sin errores y un Plan de Operación conforme a las normas ahorra meses de espera.',
      zh: '标准审批周期通常为 <strong>4 至 8 个月</strong>，具体取决于当地消防部门安排 STD 850 消防检查的速度以及 CDSS 区域办公室当前的积压情况。一份零失误的 LIC 200 申请材料和合规的运营计划书（Plan of Operation）可为您节省数月时间。',
      tl: 'Ang karaniwang tagal ng proseso ay <strong>4 hanggang 8 buwan</strong>, depende sa kung gaano kabilis isasagawa ng lokal na bumbero ang inspeksyon para sa STD 850 at sa kasalukuyang backlog sa opisina ng CDSS sa rehiyon. Ang pagkakaroon ng walang-maling packet ng LIC 200 at maayos na Plan of Operation ay nakakatipid ng ilang buwan sa pagproseso.',
      vi: 'Thời gian tiêu chuẩn thường từ <strong>4 đến 8 tháng</strong>, tùy thuộc vào tốc độ kiểm tra phòng cháy chữa cháy STD 850 của sở cứu hỏa địa phương và lượng hồ sơ tồn đọng tại văn phòng CDSS khu vực. Hồ sơ LIC 200 chính xác ngay từ đầu cùng Kế hoạch Vận hành đạt chuẩn sẽ rút ngắn nhiều tháng chờ đợi.',
      ko: '표준 소요 기간은 지역 소방서의 STD 850 소방 점검 일정과 CDSS 지역 사무소의 심사 대기 물량에 따라 보통 <strong>4~8개월</strong> 정도 걸립니다. 오류 없는 LIC 200 신청 패키지와 규정에 맞는 운영 계획서(Plan of Operation)를 준비하면 심사 기간을 몇 달씩 단축할 수 있습니다.'
    },
    faq5_family: {
      es: 'Nuestra evaluación de cuidados, recorridos por centros y asesoría de ubicación son <strong>completamente gratuitos para las familias</strong>. De forma similar a un corredor de seguros o representante de inquilinos, la comunidad de cuidado con licencia nos paga una tarifa estándar de referencia de su presupuesto operativo solo después de que su ser querido se mude de forma segura. Su renta mensual nunca se incrementa y usted jamás recibirá una factura nuestra.',
      zh: '我们的照护评估、机构参观陪同与安置指导<strong>对家庭完全免费</strong>。类似于保险经纪人或租户代表，持牌照护社区仅在您的亲人安全入住后，才从其运营预算中向我们支付标准转介服务费。您的月租金绝不会被加价，也永远不会收到我们的任何账单。',
      tl: 'Ang aming pagsusuri sa pangangalaga, pagbisita sa mga pasilidad, at gabay sa paghahanap ay <strong>ganap na libre para sa mga pamilya</strong>. Katulad ng isang insurance broker o kinatawan ng nangungupahan, ang lisensyadong pasilidad lamang ang nagbabayad sa amin ng karaniwang referral fee mula sa kanilang pondo matapos ligtas na makalipat ang inyong mahal sa buhay. Hindi kailanman tataas ang inyong buwanang upa, at hindi kayo makakatanggap ng bayarin mula sa amin.',
      vi: 'Dịch vụ đánh giá nhu cầu, đưa đi tham quan cơ sở và tư vấn tìm nơi ở của chúng tôi là <strong>hoàn toàn miễn phí cho gia đình</strong>. Tương tự như người môi giới bảo hiểm hoặc đại diện người thuê nhà, chỉ khi người thân của bạn chuyển vào an toàn thì cơ sở được cấp phép mới trả cho chúng tôi phí giới thiệu tiêu chuẩn từ ngân sách vận hành của họ. Tiền thuê hàng tháng của bạn không bao giờ bị đội giá và bạn sẽ không bao giờ nhận hóa đơn từ chúng tôi.',
      ko: '저희의 돌봄 평가, 시설 투어 동행 및 입소 상담은 <strong>가족분들께 100% 무료</strong>입니다. 보험 브로커나 임차인 대리인과 마찬가지로, 어르신이 안전하게 입소하신 후에만 인가된 시설 측 운영 예산에서 표준 소개 수수료를 지급받습니다. 월 이용료에 수수료가 가산되지 않으며 가족분께 청구서를 보내는 일은 절대 없습니다.'
    },
    faq5_operator: {
      es: 'Los futuros propietarios, administradores e inversionistas de casas de cuidado residencial pagan <strong>tarifas profesionales transparentes y fijas</strong> por nuestros servicios de licenciamiento bajo el Título 22 de California (elaboración del paquete LIC 200, redacción del Plan de Operación, asesoría de aprobación contra incendios y preparación para la inspección previa del LPA).',
      zh: '未来的老年寄宿照护机构业主、管理员及投资者需为我们的加州 Title 22 牌照咨询服务支付<strong>透明、固定费率的专业顾问费</strong>（包括 LIC 200 申请包制作、运营计划书起草、消防验收辅导以及 LPA 预检模拟准备）。',
      tl: 'Ang mga nagbabalak na may-ari ng residential care home, administrator, at mamumuhunan ay nagbabayad ng <strong>malinaw at nakapirming propesyonal na bayarin sa pagkonsulta</strong> para sa aming mga serbisyo sa pagkuha ng lisensya sa ilalim ng California Title 22 (paggawa ng LIC 200 packet, pagsulat ng Plan of Operation, gabay sa fire clearance, at paghahanda para sa pre-licensing inspection ng LPA).',
      vi: 'Chủ sở hữu nhà chăm sóc nội trú tương lai, quản trị viên và nhà đầu tư trả <strong>phí tư vấn chuyên nghiệp minh bạch, trọn gói</strong> cho dịch vụ xin giấy phép Title 22 California của chúng tôi (soạn bộ hồ sơ LIC 200, viết Kế hoạch Vận hành, hướng dẫn giấy phép PCCC và chuẩn bị thanh tra trước cấp phép với LPA).',
      ko: '예비 주거형 요양홈(RCFE) 소유주, 관리자 및 투자자분들께는 캘리포니아 Title 22 인허가 컨설팅 서비스(LIC 200 신청서 작성, 운영 계획서 초안 작성, 소방 승인 코칭, LPA 사전 실사 대비)에 대해 <strong>투명한 정액제 전문 컨설팅 수수료</strong>를 안내해 드립니다.'
    },
    privacy4_p: {
      es: 'Usted conserva el derecho de inspeccionar, corregir o solicitar la eliminación de cualquier información de contacto que guardemos. Simplemente escríbanos a <a href="mailto:loveRCFE@gmail.com" class="text-brand-green underline font-semibold">loveRCFE@gmail.com</a> con el asunto "Data Removal Request."',
      zh: '您有权查阅、更正或要求删除我们所保存的任何联系信息。只需发送邮件至 <a href="mailto:loveRCFE@gmail.com" class="text-brand-green underline font-semibold">loveRCFE@gmail.com</a>，邮件主题注明 "Data Removal Request" 即可。',
      tl: 'May karapatan kayong suriin, itama, o hilinging burahin ang anumang impormasyon sa pakikipag-ugnayan na hawak namin. Mag-email lamang sa amin sa <a href="mailto:loveRCFE@gmail.com" class="text-brand-green underline font-semibold">loveRCFE@gmail.com</a> na may paksang "Data Removal Request."',
      vi: 'Bạn có quyền xem, chỉnh sửa hoặc yêu cầu xóa bất kỳ thông tin liên hệ nào chúng tôi lưu giữ. Chỉ cần gửi email đến <a href="mailto:loveRCFE@gmail.com" class="text-brand-green underline font-semibold">loveRCFE@gmail.com</a> với tiêu đề "Data Removal Request."',
      ko: '귀하는 당사가 보유한 연락처 정보를 열람, 수정하거나 삭제를 요청할 권리가 있습니다. 제목을 "Data Removal Request"로 하여 <a href="mailto:loveRCFE@gmail.com" class="text-brand-green underline font-semibold">loveRCFE@gmail.com</a> 으로 이메일을 보내주시면 됩니다.'
    }
  };

  // Exhaustive phrase dictionary mapped from normalized English source text -> { es, zh, tl, vi, ko }
  var DICT = {
    "Love RCFE | Thoughtful Guidance for Elder Care & Residential Care Facilities": {
      es: "Love RCFE | Asesoría Reflexiva en Cuidado de Adultos Mayores y Centros RCFE",
      zh: "Love RCFE | 加州长者照护安置与 RCFE 牌照专业咨询",
      tl: "Love RCFE | Maingat na Gabay para sa Pag-aalaga ng Matatanda at Pasidad na RCFE",
      vi: "Love RCFE | Tư Vấn Tận Tâm Về Chăm Sóc Người Cao Tuổi & Cơ Sở RCFE",
      ko: "Love RCFE | 어르신 돌봄 입소 및 캘리포니아 RCFE 인허가 전문 상담"
    },
    "Our Services | Love RCFE Elder Care & Operator Consulting": {
      es: "Nuestros Servicios | Love RCFE Cuidado de Adultos Mayores y Consultoría",
      zh: "我们的服务 | Love RCFE 长者照护安置与运营商牌照咨询",
      tl: "Aming Mga Serbisyo | Love RCFE Pag-aalaga at Pagkonsulta sa Operator",
      vi: "Dịch Vụ | Love RCFE Tư Vấn Chăm Sóc Người Cao Tuổi & Vận Hành",
      ko: "서비스 안내 | Love RCFE 어르신 돌봄 및 RCFE 운영 컨설팅"
    },
    "Care Tools & Cost Calculators | Love RCFE": {
      es: "Herramientas de Cuidado y Calculadoras de Costos | Love RCFE",
      zh: "照护工具与费用计算器 | Love RCFE",
      tl: "Mga Tool sa Pag-aalaga at Kalkulador ng Gastos | Love RCFE",
      vi: "Công Cụ Chăm Sóc & Bảng Tính Chi Phí | Love RCFE",
      ko: "케어 도구 및 비용 계산기 | Love RCFE"
    },
    "Our Approach | Love RCFE Compassionate Care": {
      es: "Nuestro Enfoque | Love RCFE Cuidado Compasivo",
      zh: "我们的理念 | Love RCFE 用心关怀",
      tl: "Aming Pamamaraan | Love RCFE Mapagmalasakit na Pag-aalaga",
      vi: "Phương Châm | Love RCFE Chăm Sóc Tận Tâm",
      ko: "상담 철학 | Love RCFE 진심 어린 돌봄"
    },
    "Support & FAQs | Love RCFE": {
      es: "Soporte y Preguntas Frecuentes | Love RCFE",
      zh: "支持与常见问题 | Love RCFE",
      tl: "Suporta at Mga Madalas Itanong | Love RCFE",
      vi: "Hỗ Trợ & Câu Hỏi Thường Gặp | Love RCFE",
      ko: "고객 지원 및 자주 묻는 질문 | Love RCFE"
    },
    "Contact Us | Love RCFE Advisory Team": {
      es: "Contáctenos | Equipo Asesor de Love RCFE",
      zh: "联系我们 | Love RCFE 顾问团队",
      tl: "Makipag-ugnayan sa Amin | Grupo ng Tagapayo ng Love RCFE",
      vi: "Liên Hệ | Đội Ngũ Tư Vấn Love RCFE",
      ko: "문의하기 | Love RCFE 전문 상담팀"
    },
    "Terms of Use | Love RCFE": {
      es: "Términos de Uso | Love RCFE",
      zh: "使用条款 | Love RCFE",
      tl: "Mga Tuntunin sa Paggamit | Love RCFE",
      vi: "Điều Khoản Sử Dụng | Love RCFE",
      ko: "이용약관 | Love RCFE"
    },
    "Privacy Policy | Love RCFE": {
      es: "Política de Privacidad | Love RCFE",
      zh: "隐私政策 | Love RCFE",
      tl: "Patakaran sa Privacy | Love RCFE",
      vi: "Chính Sách Bảo Mật | Love RCFE",
      ko: "개인정보 처리방침 | Love RCFE"
    },
    "Page Not Found | Love RCFE": {
      es: "Página No Encontrada | Love RCFE",
      zh: "未找到页面 | Love RCFE",
      tl: "Hindi Natagpuan ang Pahina | Love RCFE",
      vi: "Không Tìm Thấy Trang | Love RCFE",
      ko: "페이지를 찾을 수 없습니다 | Love RCFE"
    },
    "Skip to main content": {
      es: "Ir al contenido principal",
      zh: "跳至主要内容",
      tl: "Lumaktaw sa pangunahing nilalaman",
      vi: "Chuyển đến nội dung chính",
      ko: "본문 바로가기"
    },
    "Free 15-Minute Advisory Consultations Available this Week": {
      es: "Consultas gratuitas de asesoría de 15 minutos disponibles esta semana",
      zh: "本周提供免费 15 分钟专业咨询预约",
      tl: "May Libreng 15-Minutong Konsultasyon Ngayong Linggo",
      vi: "Tư vấn miễn phí 15 phút hiện có lịch trong tuần này",
      ko: "이번 주 15분 무료 전문 상담 예약 가능"
    },
    "Schedule a Call": {
      es: "Programar llamada",
      zh: "预约通话",
      tl: "Mag-iskedyul ng Tawag",
      vi: "Đặt lịch gọi",
      ko: "전화 예약하기"
    },
    "Care & Consulting": {
      es: "Cuidado y Consultoría",
      zh: "照护与牌照咨询",
      tl: "Pag-aalaga at Pagkonsulta",
      vi: "Chăm Sóc & Tư Vấn",
      ko: "케어 & 컨설팅"
    },
    "Home": {
      es: "Inicio",
      zh: "首页",
      tl: "Tahanan",
      vi: "Trang chủ",
      ko: "홈"
    },
    "Services": {
      es: "Servicios",
      zh: "服务项目",
      tl: "Mga Serbisyo",
      vi: "Dịch vụ",
      ko: "서비스"
    },
    "Care Tools": {
      es: "Herramientas",
      zh: "实用工具",
      tl: "Mga Tool",
      vi: "Công cụ",
      ko: "케어 도구"
    },
    "New": {
      es: "Nuevo",
      zh: "新",
      tl: "Bago",
      vi: "Mới",
      ko: "신규"
    },
    "Our Approach": {
      es: "Nuestro Enfoque",
      zh: "服务理念",
      tl: "Aming Pamamaraan",
      vi: "Phương châm",
      ko: "상담 철학"
    },
    "FAQs & Support": {
      es: "Preguntas y Ayuda",
      zh: "常见问题",
      tl: "Mga FAQ at Suporta",
      vi: "Hỏi đáp & Hỗ trợ",
      ko: "자주 묻는 질문"
    },
    "Get in Touch": {
      es: "Contáctenos",
      zh: "联系顾问",
      tl: "Makipag-ugnayan",
      vi: "Liên hệ ngay",
      ko: "상담 문의"
    },
    "Contact": {
      es: "Contacto",
      zh: "联系",
      tl: "Makipag-ugnayan",
      vi: "Liên hệ",
      ko: "문의"
    },
    "Our Services": {
      es: "Nuestros Servicios",
      zh: "我们的服务",
      tl: "Aming Mga Serbisyo",
      vi: "Dịch vụ của chúng tôi",
      ko: "서비스 안내"
    },
    "Care Tools & Calculators": {
      es: "Herramientas y Calculadoras",
      zh: "照护工具与费用计算器",
      tl: "Mga Tool at Kalkulador",
      vi: "Công cụ & Bảng tính chi phí",
      ko: "케어 도구 및 계산기"
    },
    "Assessment & Cost": {
      es: "Evaluación y Costo",
      zh: "评估与费用",
      tl: "Pagsusuri at Gastos",
      vi: "Đánh giá & Chi phí",
      ko: "평가 및 비용"
    },
    "Support & FAQs": {
      es: "Soporte y Preguntas",
      zh: "支持与常见问题",
      tl: "Suporta at Mga FAQ",
      vi: "Hỗ trợ & Hỏi đáp",
      ko: "지원 및 FAQ"
    },
    "Start Consultation": {
      es: "Iniciar Consulta",
      zh: "开始咨询",
      tl: "Simulan ang Konsultasyon",
      vi: "Bắt đầu tư vấn",
      ko: "상담 시작하기"
    },
    "Display Mode:": {
      es: "Modo de pantalla:",
      zh: "显示模式：",
      tl: "Mode ng Display:",
      vi: "Chế độ hiển thị:",
      ko: "화면 모드:"
    },
    "Dark Mode": {
      es: "Modo Oscuro",
      zh: "深色模式",
      tl: "Dark Mode",
      vi: "Chế độ tối",
      ko: "다크 모드"
    },
    "Light Mode": {
      es: "Modo Claro",
      zh: "浅色模式",
      tl: "Light Mode",
      vi: "Chế độ sáng",
      ko: "라이트 모드"
    },
    "Language / Idioma": {
      es: "Idioma / Language",
      zh: "选择语言 / Language",
      tl: "Wika / Language",
      vi: "Ngôn ngữ / Language",
      ko: "언어 선택 / Language"
    },
    "Need urgent placement?": {
      es: "¿Necesita ubicación urgente?",
      zh: "急需寻找照护床位？",
      tl: "Kailangan ng agarang matitirhan?",
      vi: "Cần tìm chỗ ở khẩn cấp?",
      ko: "긴급 입소가 필요하신가요?"
    },
    "Care begins with understanding": {
      es: "El cuidado comienza con la comprensión",
      zh: "用心照护，源于深度理解",
      tl: "Ang pag-aalaga ay nagsisimula sa pag-unawa",
      vi: "Chăm sóc bắt đầu từ sự thấu hiểu",
      ko: "진정한 돌봄은 이해에서 시작됩니다"
    },
    "Whether you are looking for the right residential care home for a parent, or navigating California Title 22 licensing to open your own RCFE, we guide you every step of the way.": {
      es: "Ya sea que busque el hogar de cuidado residencial adecuado para su padre o madre, o necesite tramitar la licencia bajo el Título 22 de California para abrir su propio RCFE, lo guiamos en cada paso.",
      zh: "无论您是为父母寻找合适的家庭式老年照护之家，还是筹备申请加州 Title 22 牌照以创办自己的 RCFE，我们都全程为您提供细致指引。",
      tl: "Naghahanap man kayo ng tamang residential care home para sa inyong magulang, o kumukuha ng lisensyang California Title 22 upang magbukas ng sariling RCFE, gagabayan namin kayo sa bawat hakbang.",
      vi: "Dù bạn đang tìm mái ấm chăm sóc phù hợp cho cha mẹ, hay chuẩn bị thủ tục xin giấy phép Title 22 của California để mở cơ sở RCFE riêng, chúng tôi luôn đồng hành cùng bạn trong từng bước.",
      ko: "부모님을 위한 따뜻한 주거형 요양홈(Board & Care)을 찾고 계시든, 캘리포니아 Title 22 인허가를 준비해 직접 RCFE를 설립하시든 모든 과정을 한 걸음씩 함께합니다."
    },
    "Talk with an advisor": {
      es: "Hable con un asesor",
      zh: "与顾问交谈",
      tl: "Makipag-usap sa tagapayo",
      vi: "Trao đổi với chuyên viên",
      ko: "전문 상담사와 이야기하기"
    },
    "Take 2-Min Care Assessment": {
      es: "Evaluación rápida de 2 min",
      zh: "2 分钟照护评估",
      tl: "Kumuha ng 2-Min Pagsusuri",
      vi: "Làm bài đánh giá 2 phút",
      ko: "2분 케어 자가 진단"
    },
    "Families Guided": {
      es: "Familias asesoradas",
      zh: "已协助家庭",
      tl: "Pamilyang Nagabayan",
      vi: "Gia đình đã hỗ trợ",
      ko: "상담 완료 가족"
    },
    "Title 22 Focus": {
      es: "Enfoque Título 22",
      zh: "专注 Title 22",
      tl: "Pokus sa Title 22",
      vi: "Chuyên sâu Title 22",
      ko: "Title 22 전문성"
    },
    "Family Referral Fee": {
      es: "Costo para familias",
      zh: "家庭咨询费用",
      tl: "Bayad ng Pamilya",
      vi: "Phí tư vấn gia đình",
      ko: "가족 상담 수수료"
    },
    "Compassionate Advocacy": {
      es: "Defensa Compasiva",
      zh: "贴心倡议与守护",
      tl: "Mapagmalasakit na Paggabay",
      vi: "Đồng Hành Tận Tâm",
      ko: "진심 어린 옹호와 동행"
    },
    "Every family deserves a thoughtful, dignified path forward.": {
      es: "Cada familia merece un camino respetuoso y bien pensado.",
      zh: "每个家庭都值得拥有审慎、有尊严的照护规划。",
      tl: "Bawat pamilya ay karapat-dapat sa maingat at marangal na landas.",
      vi: "Mỗi gia đình đều xứng đáng có một hướng đi chu đáo và đầy phẩm giá.",
      ko: "모든 가정은 사려 깊고 존엄한 돌봄의 길을 누릴 자격이 있습니다."
    },
    "100% Free for Families": {
      es: "100% Gratis para Familias",
      zh: "对家庭 100% 免费",
      tl: "100% Libre sa Pamilya",
      vi: "100% Miễn Phí Cho Gia Đình",
      ko: "가족 상담 100% 무료"
    },
    "Licensed CA Care": {
      es: "Cuidado con Licencia CA",
      zh: "加州持牌机构精选",
      tl: "Lisensyadong Pangangalaga sa CA",
      vi: "Cơ Sở Cấp Phép Tại CA",
      ko: "캘리포니아 공식 인가 시설"
    },
    "Two Dedicated Paths": {
      es: "Dos Rutas Especializadas",
      zh: "两大专注服务方向",
      tl: "Dalawang Espesyal na Landas",
      vi: "Hai Hướng Hỗ Trợ Chuyên Biệt",
      ko: "두 가지 전문 지원 분야"
    },
    "How can we assist you today?": {
      es: "¿Cómo podemos ayudarle hoy?",
      zh: "今天我们可以如何协助您？",
      tl: "Paano kami makakatulong sa inyo ngayon?",
      vi: "Hôm nay chúng tôi có thể hỗ trợ gì cho bạn?",
      ko: "오늘 어떤 도움이 필요하신가요?"
    },
    "Choose the track that fits your current priority to see tailored guidance and tools.": {
      es: "Elija la opción que mejor se adapte a su prioridad actual para ver orientación y herramientas personalizadas.",
      zh: "选择符合您当前需求的路径，即可查看专属指导与实用工具。",
      tl: "Piliin ang landas na angkop sa inyong kasalukuyang pangangailangan upang makita ang gabay at mga tool.",
      vi: "Chọn lộ trình phù hợp với nhu cầu hiện tại để xem hướng dẫn và công cụ chuyên biệt.",
      ko: "현재 가장 시급한 목적에 맞는 경로를 선택해 맞춤형 안내와 도구를 확인하세요."
    },
    "For Seniors & Families": {
      es: "Para Adultos Mayores y Familias",
      zh: "面向长者与家庭",
      tl: "Para sa Nakatatanda at Pamilya",
      vi: "Dành Cho Người Cao Tuổi & Gia Đình",
      ko: "어르신 및 가족을 위한 안내"
    },
    "Looking for Quality Elder Care?": {
      es: "¿Busca cuidado de calidad para un adulto mayor?",
      zh: "正在寻找高品质的长者照护之家？",
      tl: "Naghahanap ng De-kalidad na Pag-aalaga sa Nakatatanda?",
      vi: "Đang tìm nơi chăm sóc người cao tuổi chất lượng?",
      ko: "믿을 수 있는 어르신 요양홈을 찾고 계신가요?"
    },
    "Confused by Assisted Living vs 6-bed Residential Care (Board & Care) vs Memory Care? We evaluate medical needs, budget, and location to shortlist trusted California licensed facilities.": {
      es: "¿Le confunde elegir entre Vivienda Asistida, Casa de Cuidado de 6 camas (Board & Care) o Cuidado de la Memoria? Evaluamos sus necesidades médicas, presupuesto y ubicación para preseleccionar centros confiables con licencia en California.",
      zh: "不清楚大型协助生活社区、6 床位家庭式照护之家（Board & Care）与失智症护理有何区别？我们会根据医疗需求、预算与所在地区，为您精选值得信赖的加州持牌机构。",
      tl: "Nalilito sa pagitan ng Assisted Living, 6-bed Residential Care (Board & Care), at Memory Care? Sinusuri namin ang medikal na pangangailangan, badyet, at lokasyon upang pumili ng pinagkakatiwalaang lisensyadong pasilidad sa California.",
      vi: "Bạn băn khoăn giữa Cơ sở Sinh hoạt Hỗ trợ, Nhà chăm sóc 6 giường (Board & Care) hay Chăm sóc Trí nhớ? Chúng tôi đánh giá nhu cầu y tế, ngân sách và khu vực để tuyển chọn các cơ sở có giấy phép uy tín tại California.",
      ko: "대형 어시스티드 리빙, 6인실 소규모 주거형 요양홈(Board & Care), 치매 전문 케어 중 무엇이 맞는지 막막하신가요? 의료 상태, 예산, 희망 지역을 분석해 캘리포니아 정식 인가 시설을 엄선해 드립니다."
    },
    "Unbiased facility vetting & state citation checks": {
      es: "Verificación imparcial de centros e historial de inspecciones estatales",
      zh: "客观审查机构资质与加州官方违规记录",
      tl: "Patas na pagsusuri ng pasilidad at mga rekord ng estado",
      vi: "Kiểm tra khách quan cơ sở và hồ sơ thanh tra của tiểu bang",
      ko: "객관적인 시설 검증 및 주정부 시정 기록 확인"
    },
    "Negotiation and tour accompaniment": {
      es: "Negociación de tarifas y acompañamiento en visitas",
      zh: "费用协商与实地参观陪同",
      tl: "Pakikipag-negosasyon at pagsama sa pagbisita",
      vi: "Thương lượng giá và đồng hành tham quan cơ sở",
      ko: "입소 조건 협상 및 시설 투어 동행"
    },
    "Medi-Cal ALW & VA Aid and Attendance advice": {
      es: "Orientación sobre Medi-Cal ALW y VA Aid & Attendance",
      zh: "Medi-Cal ALW 与退伍军人 Aid & Attendance 补助指导",
      tl: "Payo tungkol sa Medi-Cal ALW at VA Aid and Attendance",
      vi: "Tư vấn trợ cấp Medi-Cal ALW & VA Aid and Attendance",
      ko: "Medi-Cal ALW 및 VA 보훈 연금 지원 안내"
    },
    "View Family Services": {
      es: "Ver servicios familiares",
      zh: "查看家庭服务",
      tl: "Tingnan ang Serbisyong Pampamilya",
      vi: "Xem dịch vụ gia đình",
      ko: "가족 지원 서비스 보기"
    },
    "Start Quiz": {
      es: "Iniciar evaluación",
      zh: "开始评估",
      tl: "Simulan ang Pagsusulit",
      vi: "Bắt đầu đánh giá",
      ko: "자가진단 시작"
    },
    "For Prospective Operators": {
      es: "Para Futuros Operadores",
      zh: "面向准运营商与投资者",
      tl: "Para sa mga Nagbabalak na Operator",
      vi: "Dành Cho Nhà Đầu Tư & Vận Hành",
      ko: "예비 RCFE 운영자 안내"
    },
    "Opening an RCFE Care Home?": {
      es: "¿Desea abrir una casa de cuidado RCFE?",
      zh: "计划创办 RCFE 长者照护之家？",
      tl: "Magbubukas ba ng RCFE Care Home?",
      vi: "Bạn muốn mở Nhà Chăm Sóc RCFE?",
      ko: "RCFE 요양홈 개원을 준비 중이신가요?"
    },
    "California Title 22 compliance and CDSS licensing can feel daunting. We handle your LIC 200 packet, Plan of Operation, fire clearance prep, and pre-licensing walk-through.": {
      es: "Cumplir con el Título 22 de California y obtener la licencia del CDSS puede parecer abrumador. Preparamos su paquete LIC 200, Plan de Operación, aprobación contra incendios y recorrido previo a la licencia.",
      zh: "加州 Title 22 法规与 CDSS 牌照审批流程往往令人无从下手。我们全权协助准备 LIC 200 申请材料、撰写运营计划书、筹备消防许可及预检演练。",
      tl: "Maaaring nakakalula ang pagsunod sa California Title 22 at pagkuha ng lisensya sa CDSS. Kami ang bahala sa inyong LIC 200 packet, Plan of Operation, fire clearance prep, at pre-licensing walk-through.",
      vi: "Quy định Title 22 của California và thủ tục cấp phép CDSS có thể rất phức tạp. Chúng tôi hỗ trợ bộ hồ sơ LIC 200, Kế hoạch Vận hành, chuẩn bị giấy phép PCCC và diễn tập thanh tra trước cấp phép.",
      ko: "캘리포니아 Title 22 규정 준수와 CDSS 인허가 절차는 복잡하게 느껴질 수 있습니다. LIC 200 신청 서류, 운영 계획서, 소방 승인 준비, 사전 실사 대비까지 전담 지원해 드립니다."
    },
    "Complete LIC 200 packet & policy manual authoring": {
      es: "Paquete completo LIC 200 y redacción de manuales de políticas",
      zh: "全套 LIC 200 申请包及管理制度手册编制",
      tl: "Kumpletong LIC 200 packet at paggawa ng manwal ng patakaran",
      vi: "Hoàn thiện bộ hồ sơ LIC 200 và sổ tay quy trình vận hành",
      ko: "LIC 200 전체 신청 서류 및 운영 규정 매뉴얼 작성"
    },
    "STD 850 Fire Marshal clearance guidance": {
      es: "Asesoría para aprobación de bomberos STD 850",
      zh: "STD 850 消防官员验收指导",
      tl: "Gabay sa STD 850 Fire Marshal clearance",
      vi: "Hướng dẫn thông qua kiểm tra PCCC STD 850",
      ko: "STD 850 소방국 승인 절차 코칭"
    },
    "Administrator certification guidance & mock inspections": {
      es: "Guía para certificación de administrador e inspecciones simuladas",
      zh: "管理员认证指导与模拟现场检查",
      tl: "Gabay sa sertipikasyon ng administrator at kunwaring inspeksyon",
      vi: "Hướng dẫn chứng chỉ quản trị viên & thanh tra giả lập",
      ko: "관리자 자격 취득 안내 및 모의 현장 실사"
    },
    "View Operator Consulting": {
      es: "Ver consultoría de operadores",
      zh: "查看运营商咨询",
      tl: "Tingnan ang Pagkonsulta sa Operator",
      vi: "Xem tư vấn mở cơ sở",
      ko: "운영자 컨설팅 보기"
    },
    "Book Strategy Session": {
      es: "Reservar sesión estratégica",
      zh: "预约战略咨询",
      tl: "Mag-book ng Strategy Session",
      vi: "Đặt lịch tư vấn chiến lược",
      ko: "전략 상담 예약"
    },
    "Voices of Trust": {
      es: "Voces de Confianza",
      zh: "真实信赖之声",
      tl: "Mga Boses ng Tiwala",
      vi: "Niềm Tin Từ Khách Hàng",
      ko: "신뢰의 목소리"
    },
    "Stories of Peace of Mind": {
      es: "Historias de Tranquilidad",
      zh: "安心托付的故事",
      tl: "Mga Kwento ng Kapanatagan ng Loob",
      vi: "Những Câu Chuyện An Tâm",
      ko: "평안을 찾은 가족들의 이야기"
    },
    "Hear directly from adult children finding safe homes for parents, and healthcare entrepreneurs launching successful care communities.": {
      es: "Conozca las experiencias de hijos que encontraron hogares seguros para sus padres y emprendedores de la salud que lanzaron sus comunidades con éxito.",
      zh: "听听为父母找到安全温暖之家的子女们，以及成功创办照护社区的医疗健康创业者如何评价。",
      tl: "Pakinggan ang mga anak na nakahanap ng ligtas na tahanan para sa magulang, at mga healthcare entrepreneur na matagumpay na nagbukas ng komunidad.",
      vi: "Lắng nghe chia sẻ từ những người con tìm được mái ấm an toàn cho cha mẹ, và các chủ cơ sở y tế khởi nghiệp thành công.",
      ko: "부모님을 위한 안전한 보금자리를 찾은 자녀들과 성공적으로 요양 홈을 개원한 의료 창업자들의 생생한 후기입니다."
    },
    "\"When Mom was diagnosed with progressive dementia, hospital discharge gave us 48 hours to find a place. Love RCFE took my panic, calmed me down, and placed her in an intimate 6-bed home 10 minutes away. Mom is smiling again.\"": {
      es: "\"Cuando diagnosticaron a mi mamá con demencia progresiva, el hospital nos dio 48 horas tras el alta para encontrar un lugar. Love RCFE calmó mi pánico y la ubicó en una acogedora casa de 6 camas a 10 minutos. Mi mamá volvió a sonreír.\"",
      zh: "“当妈妈确诊进行性失智症时，医院只给了我们 48 小时出院安置时间。Love RCFE 抚平了我的慌乱，在离家 10 分钟的一家温馨 6 床位小家为妈妈安排好一切。妈妈又露出了笑容。”",
      tl: "\"Nang ma-diagnose si Nanay na may dementia, binigyan lang kami ng ospital ng 48 oras bago i-discharge para humanap ng matitirhan. Pinakalma ako ng Love RCFE at nailipat siya sa isang maaliwalas na 6-bed home na 10 minuto lang ang layo. Ngumingiti na ulit si Nanay.\"",
      vi: "\"Khi mẹ tôi được chẩn đoán sa sút trí tuệ tiến triển, bệnh viện chỉ cho 48 giờ xuất viện để tìm chỗ ở. Love RCFE đã giúp tôi bình tĩnh lại và đưa mẹ vào một mái ấm 6 giường ấm cúng cách nhà chỉ 10 phút. Mẹ đã mỉm cười trở lại.\"",
      ko: "\"어머니께서 진행성 치매 진단을 받으셨을 때 병원에서 퇴원까지 48시간밖에 시간이 없었습니다. 패닉에 빠진 저를 진정시켜 주시고 집에서 10분 거리의 아늑한 6인실 홈에 입소시켜 주셨어요. 어머니가 다시 웃고 계십니다.\""
    },
    "Daughter & Family Caregiver, San Jose CA": {
      es: "Hija y cuidadora familiar, San Jose, CA",
      zh: "女儿兼家庭照护者 · 加州圣何塞",
      tl: "Anak at Tagapag-alaga sa Pamilya, San Jose CA",
      vi: "Con gái & người chăm sóc, San Jose CA",
      ko: "보호자 자녀 · 캘리포니아 새너제이"
    },
    "\"As a registered nurse, I knew patient care, but California Title 22 bureaucracy almost made me quit. Love RCFE wrote our Plan of Operation, coached our Component III interview, and we passed our pre-licensing inspection on the first visit.\"": {
      es: "\"Como enfermero titulado conocía el cuidado clínico, pero la burocracia del Título 22 casi me hace rendirme. Love RCFE redactó nuestro Plan de Operación, nos preparó para la entrevista del Componente III y aprobamos la inspección inicial en la primera visita.\"",
      zh: "“身为注册护士，我精通临床护理，但加州 Title 22 繁琐的规章差点让我放弃。Love RCFE 为我们撰写了运营计划书、辅导 Component III 面谈，结果我们在首次牌照预检中一次顺利通过。”",
      tl: "\"Bilang registered nurse, kabisado ko ang pag-aalaga ng pasyente, pero muntik na akong sumuko sa dami ng papel sa California Title 22. Isinulat ng Love RCFE ang aming Plan of Operation, tinuruan kami sa Component III interview, at nakapasa kami sa unang inspeksyon pa lang.\"",
      vi: "\"Là điều dưỡng có bằng, tôi rành chăm sóc bệnh nhân nhưng thủ tục Title 22 suýt làm tôi bỏ cuộc. Love RCFE đã soạn Kế hoạch Vận hành, luyện phỏng vấn Component III giúp chúng tôi vượt qua đợt thanh tra cấp phép ngay lần đầu.\"",
      ko: "\"정규 간호사로서 환자 돌봄은 자신 있었지만 캘리포니아 Title 22 행정 절차 때문에 포기할 뻔했습니다. Love RCFE가 운영 계획서 작성과 Component III 인터뷰를 코칭해 준 덕분에 첫 방문 실사에서 단번에 합격했습니다.\""
    },
    "Licensed RCFE Owner, Sacramento CA": {
      es: "Propietario de RCFE con licencia, Sacramento, CA",
      zh: "持牌 RCFE 机构业主 · 加州萨克拉门托",
      tl: "Lisensyadong May-ari ng RCFE, Sacramento CA",
      vi: "Chủ cơ sở RCFE có giấy phép, Sacramento CA",
      ko: "인가 RCFE 시설 대표 · 캘리포니아 새크라멘토"
    },
    "\"They explained the difference between commercial 100-resident assisted living facilities and small residential board-and-care homes. That saved us nearly $2,400 a month and gave my father 1-on-3 personal attention.\"": {
      es: "\"Nos explicaron la diferencia entre grandes residencias de 100 personas y casas pequeñas de cuidado residencial. Eso nos ahorró casi $2,400 al mes y le dio a mi padre atención personalizada de 1 cuidador por cada 3 residentes.\"",
      zh: "“他们清晰比较了百人大型商业养老社区与小型家庭式照护之家的差异。这不仅每月为我们节省了近 2,400 美元，也让父亲享受到 1 对 3 的贴心照护。”",
      tl: "\"Ipinaliwanag nila ang kaibahan ng malalaking 100-residenteng assisted living at ng maliliit na residential board-and-care home. Nakatipid kami ng halos $2,400 bawat buwan at nabigyan si Tatay ng 1-sa-3 na personal na pag-aalaga.\"",
      vi: "\"Họ giải thích rõ sự khác biệt giữa khu dưỡng lão thương mại 100 người và nhà chăm sóc nhỏ 6 giường. Điều đó giúp gia đình tiết kiệm gần $2,400/tháng và bố tôi được chăm sóc tỉ lệ 1 kèm 3 tận tình.\"",
      ko: "\"100인 규모 대형 시설과 소규모 주거형 보드앤케어의 차이를 명확히 설명해 주셨습니다. 덕분에 매달 약 2,400달러를 아끼면서 아버지께 1대3 밀착 돌봄을 해드릴 수 있었어요.\""
    },
    "Family Caregivers, Irvine CA": {
      es: "Cuidadores familiares, Irvine, CA",
      zh: "家庭照护者 · 加州尔湾",
      tl: "Mga Tagapag-alaga sa Pamilya, Irvine CA",
      vi: "Gia đình người chăm sóc, Irvine CA",
      ko: "가족 보호자 · 캘리포니아 어바인"
    },
    "* Representative composite client experiences. Real family and facility records are kept strictly confidential.": {
      es: "* Experiencias representativas compuestas de clientes. Los registros reales de familias y centros se mantienen bajo estricta confidencialidad.",
      zh: "* 以上为具有代表性的客户综合案例展示。真实家庭与机构档案均严格保密。",
      tl: "* Kinatawang karanasan ng mga kliyente. Ang tunay na talaan ng pamilya at pasilidad ay mahigpit na kumpidensyal.",
      vi: "* Câu chuyện tiêu biểu tổng hợp từ trải nghiệm khách hàng. Hồ sơ gia đình và cơ sở thực tế được bảo mật tuyệt đối.",
      ko: "* 고객 사례를 바탕으로 구성한 대표 후기이며, 실제 가족 및 시설 기록은 엄격히 비밀이 유지됩니다."
    },
    "Our Core Practice": {
      es: "Nuestra Práctica Principal",
      zh: "核心服务领域",
      tl: "Aming Pangunahing Serbisyo",
      vi: "Lĩnh Vực Chuyên Môn",
      ko: "핵심 전문 분야"
    },
    "Expert Guidance for Families & Care Providers": {
      es: "Asesoría Experta para Familias y Proveedores de Cuidado",
      zh: "为家庭与照护机构提供专家级指导",
      tl: "Dalubhasang Gabay para sa mga Pamilya at Care Provider",
      vi: "Hướng Dẫn Chuyên Sâu Cho Gia Đình & Nhà Vận Hành",
      ko: "가족과 시설 운영자를 위한 전문 컨설팅"
    },
    "Care decisions affect health, dignity, and life savings. We provide clear, objective expertise whether you are placing a loved one or launching an elder care business.": {
      es: "Las decisiones de cuidado impactan la salud, la dignidad y el patrimonio familiar. Brindamos asesoría clara y objetiva tanto si busca un hogar para un ser querido como si inicia su propio centro de cuidado.",
      zh: "照护决策关乎长者的健康、尊严与家庭毕生积蓄。无论您是为亲人寻找居所还是创立长者照护事业，我们都提供透明客观的专业支持。",
      tl: "Ang mga desisyon sa pag-aalaga ay nakakaapekto sa kalusugan, dignidad, at ipon habambuhay. Nagbibigay kami ng malinaw at patas na payo sa paghahanap ng tahanan o pagsisimula ng negosyong care home.",
      vi: "Quyết định chăm sóc ảnh hưởng đến sức khỏe, phẩm giá và tài sản tích lũy cả đời. Chúng tôi mang đến kiến thức khách quan cho cả gia đình tìm nơi ở lẫn người khởi nghiệp cơ sở chăm sóc.",
      ko: "돌봄에 관한 결정은 건강과 존엄성, 그리고 평생 모은 자산에 직결됩니다. 어르신 입소 안내든 RCFE 창업 준비든 명쾌하고 객관적인 전문 지식을 제공합니다."
    },
    "Services for Seniors & Families": {
      es: "Servicios para Adultos Mayores y Familias",
      zh: "面向长者与家庭的服务",
      tl: "Mga Serbisyo para sa Nakatatanda at Pamilya",
      vi: "Dịch Vụ Dành Cho Người Cao Tuổi & Gia Đình",
      ko: "어르신 및 가족을 위한 서비스"
    },
    "Comprehensive Level-of-Care Audit": {
      es: "Evaluación Integral del Nivel de Cuidado",
      zh: "全面照护等级评估",
      tl: "Komprehensibong Pagsusuri ng Antas ng Pag-aalaga",
      vi: "Đánh Giá Toàn Diện Mức Độ Chăm Sóc",
      ko: "종합 돌봄 수준 정밀 평가"
    },
    "We review current ADL scores, physician reports (LIC 602A), and behavioral symptoms to determine whether an independent board-and-care, specialized memory care, or skilled nursing is medically necessary.": {
      es: "Revisamos actividades de la vida diaria (ADL), informes médicos (LIC 602A) y síntomas conductuales para definir si es médicamente necesario un hogar residencial, cuidado de la memoria o enfermería especializada.",
      zh: "我们综合评估日常活动能力（ADL）评分、医生体检报告（LIC 602A）及行为症状，判断最适合普通家庭式照护、专业失智照护还是专业护理机构。",
      tl: "Sinusuri namin ang mga marka ng ADL, ulat ng doktor (LIC 602A), at sintomas upang matukoy kung kailangan ang board-and-care, memory care, o skilled nursing.",
      vi: "Chúng tôi xem xét chỉ số sinh hoạt hàng ngày (ADL), báo cáo bác sĩ (LIC 602A) và biểu hiện hành vi để xác định mô hình chăm sóc nội trú, trí nhớ hay điều dưỡng phù hợp.",
      ko: "일상생활수행능력(ADL) 점수, 의사 소견서(LIC 602A), 행동 증상을 검토해 일반 보드앤케어, 치매 전문 케어, 또는 전문 간호시설 중 의학적으로 필요한 단계를 판단합니다."
    },
    "Includes Physician Form LIC 602A Review": {
      es: "Incluye revisión del Formulario Médico LIC 602A",
      zh: "包含医生评估表 LIC 602A 审核",
      tl: "May Kasamang Pagsusuri ng Form LIC 602A ng Doktor",
      vi: "Bao gồm rà soát Mẫu Y Tế LIC 602A",
      ko: "의사 평가서 LIC 602A 검토 포함"
    },
    "Curated Placement & Tour Support": {
      es: "Selección Personalizada y Apoyo en Visitas",
      zh: "精选安置推荐与参观陪同",
      tl: "Piniling Pag-aangkop at Suporta sa Pagbisita",
      vi: "Tuyển Chọn Cơ Sở & Hỗ Trợ Tham Quan",
      ko: "맞춤형 시설 추천 및 투어 동행"
    },
    "We inspect state CDSS licensing files for past citations, staff turnover rates, and food ratings before scheduling private family tours. We accompany you or provide a touring checklist.": {
      es: "Revisamos los expedientes estatales del CDSS para verificar citaciones previas, rotación de personal y calidad alimentaria antes de programar visitas privadas. Le acompañamos o le entregamos una lista de verificación.",
      zh: "在安排私人参观前，我们会事先核查加州 CDSS 官方检查档案、员工流动性及膳食评价，并可陪同参观或提供详尽考察清单。",
      tl: "Sinisiyasat muna namin ang mga file ng CDSS ng estado para sa mga nakaraang paglabag, bilis ng pagpalit ng tauhan, at kalidad ng pagkain bago magtakda ng pribadong pagbisita.",
      vi: "Chúng tôi kiểm tra hồ sơ cấp phép CDSS về các lỗi vi phạm trước đây, tỷ lệ thay đổi nhân sự và chất lượng bữa ăn trước khi hẹn lịch tham quan riêng.",
      ko: "개별 방문 일정을 잡기 전 주정부 CDSS 파일에서 과거 시정 명령 이력, 직원 이직률, 식단 수준을 먼저 확인하고 직접 동행하거나 점검 체크리스트를 제공합니다."
    },
    "100% Free Placement Service for Families": {
      es: "Servicio de ubicación 100% gratuito para familias",
      zh: "家庭安置服务 100% 免费",
      tl: "100% Libreng Serbisyo para sa mga Pamilya",
      vi: "Dịch vụ tìm nơi ở miễn phí 100% cho gia đình",
      ko: "가족을 위한 100% 무료 입소 연계"
    },
    "Benefit & Financial Navigation": {
      es: "Orientación Financiera y de Beneficios",
      zh: "福利补助与财务规划导航",
      tl: "Paggabay sa Benepisyo at Pinansyal",
      vi: "Hướng Dẫn Quyền Lợi & Tài Chính",
      ko: "정부 지원금 및 재정 혜택 안내"
    },
    "Assistance understanding Veterans Aid & Attendance pensions (up to $2,431+/mo for single veterans and $2,881+/mo for married veterans), Long-Term Care Insurance policies, and Medi-Cal ALW eligibility.": {
      es: "Ayuda para comprender pensiones de Veterans Aid & Attendance (hasta $2,431+/mes para veteranos solteros y $2,881+/mes para casados), seguros de cuidado a largo plazo y elegibilidad para Medi-Cal ALW.",
      zh: "协助了解退伍军人 Aid & Attendance 补助（单身每月最高 $2,431+，已婚最高 $2,881+）、长期护理保险理赔以及 Medi-Cal ALW 申请资格。",
      tl: "Tulong sa pag-unawa sa pensyon ng Veterans Aid & Attendance (hanggang $2,431+/buwan para sa solong beterano at $2,881+/buwan para sa may asawa), Long-Term Care Insurance, at Medi-Cal ALW.",
      vi: "Hỗ trợ tìm hiểu trợ cấp Cựu chiến binh Aid & Attendance (tới $2,431+/tháng cho cá nhân và $2,881+/tháng cho cặp vợ chồng), bảo hiểm chăm sóc dài hạn và Medi-Cal ALW.",
      ko: "퇴역군인 Aid & Attendance 연금(독신 월 최대 $2,431+, 기혼 월 최대 $2,881+), 장기요양보험(LTC) 및 Medi-Cal ALW 수급 자격을 알기 쉽게 안내합니다."
    },
    "Advocacy for Long-Term Care Claims": {
      es: "Apoyo en reclamos de Seguro a Largo Plazo",
      zh: "长期护理保险理赔协助",
      tl: "Pagtulong sa mga Claim ng Long-Term Care",
      vi: "Hỗ trợ hồ sơ Bảo hiểm Chăm sóc Dài hạn",
      ko: "장기요양보험(LTC) 청구 지원"
    },
    "Consulting for RCFE Operators & Investors": {
      es: "Consultoría para Operadores e Inversionistas de RCFE",
      zh: "面向 RCFE 运营商与投资者的专业咨询",
      tl: "Pagkonsulta para sa mga Operator at Investor ng RCFE",
      vi: "Tư Vấn Cho Nhà Vận Hành & Đầu Tư RCFE",
      ko: "RCFE 운영자 및 투자자 컨설팅"
    },
    "Turnkey LIC 200 Licensing Packet": {
      es: "Paquete Llave en Mano de Licencia LIC 200",
      zh: "一站式 LIC 200 牌照申请材料包",
      tl: "Kumpletong LIC 200 Licensing Packet",
      vi: "Bộ Hồ Sơ Xin Phép LIC 200 Trọn Gói",
      ko: "맞춤형 LIC 200 인허가 신청 패키지"
    },
    "We draft your entire 30+ item application: Plan of Operation, Admission Agreement, House Rules, Emergency Disaster Plan (LIC 610E), Theft & Loss Policy, and Job Descriptions tailored to Title 22.": {
      es: "Redactamos toda su solicitud de más de 30 documentos: Plan de Operación, Contrato de Admisión, Reglas de la Casa, Plan de Desastres (LIC 610E), Política de Pérdidas y Descripciones de Puestos según el Título 22.",
      zh: "我们为您起草包含 30 余项文件的完整申请包：运营计划书、入住协议、院规、应急灾害计划（LIC 610E）、防盗与物品遗失制度及符合 Title 22 标准的岗位职责。",
      tl: "Inihahanda namin ang buong 30+ bahaging aplikasyon: Plan of Operation, Admission Agreement, House Rules, Emergency Disaster Plan (LIC 610E), Theft & Loss Policy, at mga Job Description na angkop sa Title 22.",
      vi: "Chúng tôi soạn thảo trọn bộ hơn 30 hạng mục hồ sơ: Kế hoạch Vận hành, Hợp đồng Nhập viện, Nội quy, Kế hoạch Thảm họa (LIC 610E), Chính sách Bảo vệ Tài sản và Mô tả Công việc chuẩn Title 22.",
      ko: "운영 계획서, 입소 계약서, 생활 수칙, 비상 재난 계획(LIC 610E), 도난·분실 규정, Title 22 기준 직무 기술서 등 30여 종의 전체 신청 서류를 직접 작성합니다."
    },
    "Guaranteed Resubmission Support": {
      es: "Soporte garantizado de reenvío ante observaciones",
      zh: "免费跟进补正与重新提交支持",
      tl: "Garantisadong Suporta sa Muling Pagsusumite",
      vi: "Bảo đảm hỗ trợ bổ sung và nộp lại hồ sơ",
      ko: "보완 요청 시 재접수 책임 지원"
    },
    "Physical Plant & Fire Clearance (STD 850)": {
      es: "Planta Física y Aprobación de Bomberos (STD 850)",
      zh: "场地合规与消防验收指导 (STD 850)",
      tl: "Pisikal na Pasilidad at Fire Clearance (STD 850)",
      vi: "Thẩm Định Cơ Sở Vật Chất & PCCC (STD 850)",
      ko: "시설 구조 검토 및 소방 승인 (STD 850)"
    },
    "Site feasibility review before you lease or buy. Guidance on sprinkler requirements, egress routes, door hardware, wheelchair ramps, and local fire marshal coordination for non-ambulatory/bedridden clearance.": {
      es: "Evaluación previa antes de alquilar o comprar. Guía sobre rociadores, rutas de evacuación, herrajes de puertas, rampas y coordinación con bomberos para residentes no ambulatorios o postrados en cama.",
      zh: "在签约租赁或购房前进行场地可行性评估，提供消防喷淋、逃生通道、门锁五金、轮椅坡道及行动不便/卧床资质审批的消防协调指导。",
      tl: "Pagsusuri ng lokasyon bago umupa o bumili. Gabay sa mga sprinkler, labasan ng emergency, kandado ng pinto, rampa ng wheelchair, at pakikipag-ugnayan sa bumbero para sa non-ambulatory/bedridden clearance.",
      vi: "Đánh giá tính khả thi mặt bằng trước khi thuê hoặc mua. Hướng dẫn hệ thống phun nước, lối thoát hiểm, khóa cửa, đường dốc xe lăn và làm việc với thanh tra PCCC cho người nằm liệt giường.",
      ko: "임대·매입 전 입지 타당성 검토부터 스프링클러, 비상 대피로, 문 손잡이 규격, 휠체어 경사로, 비보행·와상 입소자 승인을 위한 소방국 협의까지 안내합니다."
    },
    "Avoid Costly Remodeling Delays": {
      es: "Evite costosos retrasos de remodelación",
      zh: "避免昂贵的返工与工期延误",
      tl: "Iwasan ang Magastos na Pagkaantala sa Pagpapaayos",
      vi: "Tránh chậm trễ và chi phí sửa chữa tốn kém",
      ko: "불필요한 공사비와 일정 지연 예방"
    },
    "Component III & Pre-Licensing Prep": {
      es: "Preparación para Componente III y Pre-Licencia",
      zh: "Component III 面谈与发牌前预检筹备",
      tl: "Component III at Paghahanda Bago Maglisensya",
      vi: "Luyện Phỏng Vấn Component III & Chuẩn Bị Kiểm Tra",
      ko: "Component III 인터뷰 및 사전 실사 대비"
    },
    "One-on-one coaching for your CDSS LPA interview, mock licensing walk-through, medication room staging, resident chart setup, and staff onboarding protocols so you open on schedule.": {
      es: "Entrenamiento individual para su entrevista con el analista LPA del CDSS, recorrido simulado, sala de medicamentos, expedientes de residentes y protocolos de contratación para abrir a tiempo.",
      zh: "一对一辅导您的 CDSS LPA 面谈、全真模拟检查走查、药房布置、长者档案建立以及员工入职流程，确保您的机构按期开业。",
      tl: "Isa-sa-isang coaching para sa inyong panayam sa CDSS LPA, kunwaring inspeksyon, pag-aayos ng silid ng gamot, talaan ng residente, at pagsasanay ng kawani.",
      vi: "Huấn luyện 1-kèm-1 cho buổi phỏng vấn CDSS LPA, kiểm tra thử thực tế, bố trí phòng thuốc, thiết lập hồ sơ cư dân và quy trình tiếp nhận nhân viên để khai trương đúng hẹn.",
      ko: "CDSS 심사관(LPA) 인터뷰 1:1 코칭, 모의 현장 실사, 투약실 세팅, 입소자 차트 구성, 직원 채용 절차까지 일정에 맞춰 개원할 수 있도록 돕습니다."
    },
    "Mock LPA Audit Included": {
      es: "Auditoría simulada LPA incluida",
      zh: "包含模拟 LPA 现场审核",
      tl: "May Kasamang Kunwaring Pagsusuri ng LPA",
      vi: "Bao gồm buổi kiểm tra thử LPA",
      ko: "모의 LPA 실사 점검 포함"
    },
    "Ready to discuss your specific goals?": {
      es: "¿Listo para hablar sobre sus metas específicas?",
      zh: "准备好讨论您的具体目标了吗？",
      tl: "Handa na bang pag-usapan ang inyong mga layunin?",
      vi: "Sẵn sàng trao đổi về mục tiêu cụ thể của bạn?",
      ko: "구체적인 목표에 대해 상담해 볼까요?"
    },
    "Every family and every care facility is distinct. We provide honest answers in plain English without sales pressure.": {
      es: "Cada familia y cada centro es único. Brindamos respuestas claras y honestas, sin presiones de venta.",
      zh: "每个家庭与每所照护机构都有其独特之处。我们以坦诚通俗的语言作答，绝无推销压力。",
      tl: "Bawat pamilya at pasilidad ay natatangi. Nagbibigay kami ng tapat at malinaw na sagot nang walang pamimilit.",
      vi: "Mỗi gia đình và mỗi cơ sở đều có nét riêng. Chúng tôi tư vấn trung thực, dễ hiểu và không bao giờ gây áp lực.",
      ko: "모든 가정과 시설의 상황은 저마다 다릅니다. 영업 부담 없이 솔직하고 명쾌한 해답을 드립니다."
    },
    "Contact Our Team": {
      es: "Contactar al equipo",
      zh: "联系我们的团队",
      tl: "Makipag-ugnayan sa Amin",
      vi: "Liên hệ đội ngũ tư vấn",
      ko: "상담팀에 문의하기"
    },
    "Book a 15-Min Advisory Call": {
      es: "Reservar llamada de 15 min",
      zh: "预约 15 分钟电话咨询",
      tl: "Mag-book ng 15-Min Tawag",
      vi: "Đặt cuộc gọi tư vấn 15 phút",
      ko: "15분 전화 상담 예약"
    },
    "Interactive Resources": {
      es: "Recursos Interactivos",
      zh: "互动规划工具",
      tl: "Mga Interaktibong Kagamitan",
      vi: "Công Cụ Tương Tác",
      ko: "맞춤형 인터랙티브 도구"
    },
    "Estimate senior living costs, find the appropriate level of care, and explore the California RCFE licensing timeline.": {
      es: "Estime los costos de cuidado, determine el nivel adecuado de atención y explore el cronograma de licencia RCFE en California.",
      zh: "估算长者照护月度开支、评估适合的照护级别，并查看加州 RCFE 牌照审批时间线。",
      tl: "Tantyahin ang gastos sa pag-aalaga, hanapin ang tamang antas ng serbisyo, at tingnan ang timeline ng lisensyang RCFE sa California.",
      vi: "Ước tính chi phí chăm sóc, tìm mức độ hỗ trợ phù hợp và khám phá lộ trình xin giấy phép RCFE tại California.",
      ko: "어르신 돌봄 예상 비용을 계산하고, 알맞은 돌봄 수준과 캘리포니아 RCFE 인허가 일정을 확인하세요."
    },
    "Cost Estimator": {
      es: "Calculadora de Costos",
      zh: "费用估算器",
      tl: "Tantya ng Gastos",
      vi: "Ước tính chi phí",
      ko: "비용 계산기"
    },
    "Care Level Assessment": {
      es: "Evaluación de Cuidado",
      zh: "照护等级评估",
      tl: "Pagsusuri ng Pag-aalaga",
      vi: "Đánh giá mức chăm sóc",
      ko: "돌봄 단계 자가진단"
    },
    "Operator Licensing Roadmap": {
      es: "Ruta de Licenciamiento",
      zh: "运营商发牌路线图",
      tl: "Roadmap sa Pagkuha ng Lisensya",
      vi: "Lộ trình xin giấy phép",
      ko: "운영자 인허가 로드맵"
    },
    "California Elder Care Monthly Cost Calculator": {
      es: "Calculadora Mensual de Costos de Cuidado en California",
      zh: "加州长者照护月度费用计算器",
      tl: "Kalkulador ng Buwanang Gastos sa Pag-aalaga sa California",
      vi: "Bảng Tính Chi Phí Chăm Sóc Hàng Tháng Tại California",
      ko: "캘리포니아 어르신 돌봄 월 비용 계산기"
    },
    "Based on prevailing 2025–2026 California regional market rates for RCFEs & Assisted Living.": {
      es: "Basado en tarifas regionales vigentes del mercado 2025–2026 en California para RCFE y Vivienda Asistida.",
      zh: "基于 2025–2026 年加州各地区 RCFE 与协助生活市场的现行收费水平。",
      tl: "Batay sa kasalukuyang taripa sa merkado ng California (2025–2026) para sa mga RCFE at Assisted Living.",
      vi: "Dựa trên mức giá thị trường California hiện hành giai đoạn 2025–2026 cho RCFE & Sinh hoạt Hỗ trợ.",
      ko: "2025–2026년 캘리포니아 지역별 RCFE 및 어시스티드 리빙 시장 평균 요금 기준입니다."
    },
    "Care Budget Calculator": {
      es: "Calculadora de Presupuesto",
      zh: "照护预算计算器",
      tl: "Kalkulador ng Badyet",
      vi: "Máy tính ngân sách",
      ko: "예산 계산기"
    },
    "Copy": {
      es: "Copiar",
      zh: "复制",
      tl: "Kopyahin",
      vi: "Sao chép",
      ko: "복사"
    },
    "Copied!": {
      es: "¡Copiado!",
      zh: "已复制！",
      tl: "Nakopya!",
      vi: "Đã chép!",
      ko: "복사됨!"
    },
    "Failed": {
      es: "Error",
      zh: "失败",
      tl: "Bigo",
      vi: "Lỗi",
      ko: "실패"
    },
    "Use in Budget": {
      es: "Usar en presupuesto",
      zh: "用于预算咨询",
      tl: "Gamitin sa Badyet",
      vi: "Dùng cho ngân sách",
      ko: "예산에 반영"
    },
    "Keyboard shortcuts enabled • Click \"Use in Budget\" to transfer calculated cost to inquiry": {
      es: "Atajos de teclado activos • Haga clic en \"Usar en presupuesto\" para enviar este monto a su consulta",
      zh: "支持键盘快捷输入 • 点击“用于预算咨询”即可将结果带入联系表单",
      tl: "Gumagana ang mga keyboard shortcut • I-click ang \"Gamitin sa Badyet\" upang ilipat ang halaga sa pagtatanong",
      vi: "Hỗ trợ phím tắt • Nhấn \"Dùng cho ngân sách\" để chuyển số tiền đã tính vào biểu mẫu liên hệ",
      ko: "키보드 입력 지원 • \"예산에 반영\"을 누르면 계산된 금액이 문의 양식에 자동 입력됩니다"
    },
    "Region in California": {
      es: "Región de California",
      zh: "加州所在地区",
      tl: "Rehiyon sa California",
      vi: "Khu vực tại California",
      ko: "캘리포니아 내 희망 지역"
    },
    "San Francisco Bay Area / Silicon Valley (Tier 1 High)": {
      es: "Área de la Bahía de SF / Silicon Valley (Nivel 1 Alto)",
      zh: "旧金山湾区 / 硅谷（一类高费用区）",
      tl: "San Francisco Bay Area / Silicon Valley (Antas 1 Mataas)",
      vi: "Khu vực Vịnh San Francisco / Thung lũng Silicon (Mức 1 Cao)",
      ko: "샌프란시스코 베이 지역 / 실리콘밸리 (1급 고비용 지역)"
    },
    "Los Angeles / Orange County / San Diego (Tier 2)": {
      es: "Los Ángeles / Condado de Orange / San Diego (Nivel 2)",
      zh: "洛杉矶 / 橙县 / 圣地亚哥（二类地区）",
      tl: "Los Angeles / Orange County / San Diego (Antas 2)",
      vi: "Los Angeles / Orange County / San Diego (Mức 2)",
      ko: "로스앤젤레스 / 오렌지 카운티 / 샌디에이고 (2급 지역)"
    },
    "Sacramento / Central Valley / Inland Empire (Tier 3)": {
      es: "Sacramento / Valle Central / Inland Empire (Nivel 3)",
      zh: "萨克拉门托 / 中央谷地 / 内陆帝国（三类地区）",
      tl: "Sacramento / Central Valley / Inland Empire (Antas 3)",
      vi: "Sacramento / Thung lũng Trung tâm / Inland Empire (Mức 3)",
      ko: "새크라멘토 / 센트럴 밸리 / 인랜드 엠파이어 (3급 지역)"
    },
    "Northern / Rural California (Tier 4)": {
      es: "Norte / Zonas Rurales de California (Nivel 4)",
      zh: "北加州 / 乡村地区（四类地区）",
      tl: "Hilagang / Rural na California (Antas 4)",
      vi: "Bắc California / Vùng ngoại ô (Mức 4)",
      ko: "북부 캘리포니아 / 외곽 지역 (4급 지역)"
    },
    "Assistance / Care Needed": {
      es: "Asistencia / Nivel de Cuidado Requerido",
      zh: "所需协助与照护等级",
      tl: "Tulong / Antas ng Pag-aalagang Kailangan",
      vi: "Mức Độ Hỗ Trợ & Chăm Sóc Cần Thiết",
      ko: "필요한 일상 지원 및 돌봄 단계"
    },
    "Minimal (Meal preparation, housekeeping, medication reminders)": {
      es: "Mínimo (Comidas, limpieza, recordatorios de medicación)",
      zh: "轻度协助（备餐、家务清洁、用药提醒）",
      tl: "Minimal (Paghahanda ng pagkain, paglilinis, paalala sa gamot)",
      vi: "Tối thiểu (Chuẩn bị bữa ăn, dọn phòng, nhắc uống thuốc)",
      ko: "최소 지원 (식사 준비, 가사 지원, 복약 알림)"
    },
    "Moderate (Bathing, dressing, transfer assistance, 1-person assist)": {
      es: "Moderado (Baño, vestirse, ayuda para trasladarse de 1 persona)",
      zh: "中度协助（洗浴、穿衣、单人协助移位）",
      tl: "Katamtaman (Paliligo, pagbibihis, tulong ng 1 tao sa paglipat)",
      vi: "Trung bình (Tắm rửa, mặc đồ, hỗ trợ di chuyển 1 người)",
      ko: "중등도 지원 (목욕, 옷 입기, 1인 부축 이동 지원)"
    },
    "Memory Care (Dementia/Alzheimer's, wandering risk, cueing)": {
      es: "Cuidado de la Memoria (Demencia/Alzheimer, riesgo de deambulación)",
      zh: "记忆/失智照护（阿尔茨海默症、防走失看护、行为引导）",
      tl: "Memory Care (Demensya/Alzheimer's, panganib ng paglalagalag)",
      vi: "Chăm sóc Trí nhớ (Sa sút trí tuệ/Alzheimer, nguy cơ đi lạc)",
      ko: "치매 전문 케어 (알츠하이머, 배회 위험, 인지 안내)"
    },
    "High Acuity / Bedridden (Total care, 2-person assist, hospice waiver)": {
      es: "Alta Complejidad / Postrado (Cuidado total, asistencia de 2 personas, hospicio)",
      zh: "高强度/卧床照护（全护理、双人协助移位、临终关怀豁免）",
      tl: "Matinding Pangangalaga / Nakaratay (Ganap na tulong, 2 tao, hospice)",
      vi: "Chăm sóc Chuyên sâu / Nằm liệt giường (Hỗ trợ toàn phần, 2 người)",
      ko: "고중증 / 와상 돌봄 (전면적 케어, 2인 보조 이동, 호스피스)"
    },
    "Room Type": {
      es: "Tipo de Habitación",
      zh: "房间类型",
      tl: "Uri ng Kwarto",
      vi: "Loại Phòng",
      ko: "객실 유형"
    },
    "Private Room": {
      es: "Habitación Privada",
      zh: "单人私密房间",
      tl: "Pribadong Kwarto",
      vi: "Phòng Riêng",
      ko: "1인실 (개인실)"
    },
    "Shared / Semi-Private": {
      es: "Compartida / Semiprivada",
      zh: "双人合住 / 半私密房间",
      tl: "Pinagsasaluhang Kwarto",
      vi: "Phòng Chia Sẻ / Bán Riêng Tư",
      ko: "2인실 (공동실)"
    },
    "What is covered in monthly RCFE rent?": {
      es: "¿Qué incluye la renta mensual en un RCFE?",
      zh: "RCFE 每月费用通常包含哪些服务？",
      tl: "Ano ang kasama sa buwanang upa sa RCFE?",
      vi: "Chi phí hàng tháng tại RCFE bao gồm những gì?",
      ko: "RCFE 월 이용료에는 무엇이 포함되나요?"
    },
    "Typical RCFE monthly fees include 3 daily home-cooked meals, 24-hour awake staffing, medication management, laundry, utilities, and daily activity programs.": {
      es: "Las tarifas mensuales típicas incluyen 3 comidas caseras diarias, personal despierto las 24 horas, manejo de medicamentos, lavandería, servicios públicos y actividades diarias.",
      zh: "通常包含每日三顿家常膳食、24 小时值守照护人员、用药管理、衣物清洗、水电杂费以及每日文娱活动。",
      tl: "Karaniwang kasama sa buwanang bayad ang 3 lutong-bahay na pagkain araw-araw, 24-oras na gising na tauhan, pamamahala ng gamot, paglalaba, kuryente/tubig, at mga aktibidad.",
      vi: "Phí hàng tháng thường bao gồm 3 bữa ăn nấu tại nhà mỗi ngày, nhân viên trực thức 24/24, quản lý thuốc, giặt ủi, điện nước và sinh hoạt hàng ngày.",
      ko: "일반적인 RCFE 월 비용에는 하루 3끼 가정식 식사, 24시간 상주 돌봄 인력, 복약 관리, 세탁, 공과금, 일일 활동 프로그램이 포함됩니다."
    },
    "Estimated Monthly Investment": {
      es: "Inversión Mensual Estimada",
      zh: "预估月度费用",
      tl: "Tinatayang Buwanang Gastos",
      vi: "Chi Phí Dự Kiến Hàng Tháng",
      ko: "예상 월 돌봄 비용"
    },
    "/ month": {
      es: "/ mes",
      zh: "/ 月",
      tl: "/ buwan",
      vi: "/ tháng",
      ko: "/ 월"
    },
    "/mo": {
      es: "/mes",
      zh: "/月",
      tl: "/bw",
      vi: "/tháng",
      ko: "/월"
    },
    "Estimates include base room and tiered care level add-ons. Illustrative only: actual rates vary by home and this is not a quote.": {
      es: "Las estimaciones incluyen habitación base y niveles adicionales de cuidado. Solo referencial: las tarifas reales varían según el centro y no constituyen una cotización.",
      zh: "估算费用已包含基础房费与分级照护附加费，仅供参考：实际收费因机构而异，不构成正式报价。",
      tl: "Kasama sa tantya ang batayang kwarto at antas ng pag-aalaga. Gabay lamang ito: nag-iiba ang aktwal na presyo bawat tahanan at hindi ito pormal na presyo.",
      vi: "Ước tính gồm phòng cơ bản và phụ phí theo cấp độ chăm sóc. Chỉ mang tính tham khảo; mức giá thực tế tùy từng cơ sở.",
      ko: "기본 방값과 돌봄 등급별 추가 비용을 합산한 참고용 추정치이며, 실제 요금은 시설마다 다르므로 공식 견적이 아닙니다."
    },
    "Residential 6-Bed Board & Care:": {
      es: "Casa Residencial de 6 Camas (Board & Care):",
      zh: "6 床位家庭式照护之家：",
      tl: "6-Bed Residential Board & Care:",
      vi: "Nhà Chăm Sóc 6 Giường (Board & Care):",
      ko: "6인실 주거형 요양홈 (Board & Care):"
    },
    "Large Assisted Living Community:": {
      es: "Comunidad Grande de Vivienda Asistida:",
      zh: "大型协助生活养老社区：",
      tl: "Malaking Assisted Living Community:",
      vi: "Khu Sinh Hoạt Có Hỗ Trợ Quy Mô Lớn:",
      ko: "대형 어시스티드 리빙 커뮤니티:"
    },
    "Equivalent 24/7 In-Home Agency Care:": {
      es: "Cuidado en Casa 24/7 por Agencia (Equivalente):",
      zh: "同等 24/7 居家护理机构费用：",
      tl: "Katumbas na 24/7 In-Home Agency Care:",
      vi: "Dịch Vụ Chăm Sóc Tại Nhà 24/7 Tương Đương:",
      ko: "동일 조건 24시간 방문요양 파견 비용:"
    },
    "720 hrs/mo at prevailing California agency rates": {
      es: "720 horas/mes a tarifas vigentes de agencias en California",
      zh: "按加州居家护理机构现行时薪计 720 小时/月",
      tl: "720 oras/buwan sa kasalukuyang taripa ng ahensya sa California",
      vi: "720 giờ/tháng theo mức giá dịch vụ hiện hành tại California",
      ko: "캘리포니아 방문요양 평균 시급 기준 월 720시간"
    },
    "Inquire About This Budget": {
      es: "Consultar sobre este presupuesto",
      zh: "按此预算咨询合适房源",
      tl: "Magtanong Tungkol sa Badyet na Ito",
      vi: "Hỏi về mức ngân sách này",
      ko: "이 예산으로 상담 요청"
    },
    "Free Placement Help": {
      es: "Ayuda Gratuita",
      zh: "免费安置协助",
      tl: "Libreng Tulong",
      vi: "Hỗ trợ miễn phí",
      ko: "무료 입소 지원"
    },
    "Self-Assessment Tool": {
      es: "Herramienta de Autoevaluación",
      zh: "在线自评工具",
      tl: "Kagamitan sa Pagsusuri",
      vi: "Công Cụ Tự Đánh Giá",
      ko: "자가진단 도구"
    },
    "Find the Right Care Setting": {
      es: "Encuentre el Entorno de Cuidado Ideal",
      zh: "匹配最合适的照护环境",
      tl: "Hanapin ang Tamang Lugar ng Pag-aalaga",
      vi: "Tìm Mô Hình Chăm Sóc Phù Hợp",
      ko: "알맞은 돌봄 환경 찾기"
    },
    "Answer 4 quick questions to receive tailored recommendations on care type, staff ratio, and touring advice.": {
      es: "Responda 4 breves preguntas para recibir recomendaciones sobre el tipo de cuidado, proporción de personal y consejos para sus visitas.",
      zh: "回答 4 个简短问题，即可获取针对照护类型、护患比及实地考察要点的专属建议。",
      tl: "Sagutin ang 4 na mabilisang tanong upang makatanggap ng payo sa uri ng pag-aalaga, bilang ng kawani, at pagbisita.",
      vi: "Trả lời 4 câu hỏi nhanh để nhận gợi ý phù hợp về loại hình chăm sóc, tỷ lệ nhân viên và lưu ý khi tham quan.",
      ko: "4가지 간단한 질문에 답하시면 적합한 시설 유형, 인력 비율, 방문 점검 포인트를 맞춤 추천해 드립니다."
    },
    "Question {step} of 4": {
      es: "Pregunta {step} de 4",
      zh: "第 {step} 题（共 4 题）",
      tl: "Tanong {step} sa 4",
      vi: "Câu hỏi {step} / 4",
      ko: "4문항 중 {step}번"
    },
    "{pct}% Complete": {
      es: "{pct}% Completado",
      zh: "已完成 {pct}%",
      tl: "{pct}% Tapos",
      vi: "Hoàn thành {pct}%",
      ko: "{pct}% 완료"
    },
    "Question 1 of 4": {
      es: "Pregunta 1 de 4",
      zh: "第 1 题（共 4 题）",
      tl: "Tanong 1 sa 4",
      vi: "Câu hỏi 1 / 4",
      ko: "4문항 중 1번"
    },
    "25% Complete": {
      es: "25% Completado",
      zh: "已完成 25%",
      tl: "25% Tapos",
      vi: "Hoàn thành 25%",
      ko: "25% 완료"
    },
    "50% Complete": {
      es: "50% Completado",
      zh: "已完成 50%",
      tl: "50% Tapos",
      vi: "Hoàn thành 50%",
      ko: "50% 완료"
    },
    "75% Complete": {
      es: "75% Completado",
      zh: "已完成 75%",
      tl: "75% Tapos",
      vi: "Hoàn thành 75%",
      ko: "75% 완료"
    },
    "100% Ready": {
      es: "100% Listo",
      zh: "即将完成 100%",
      tl: "100% Handa",
      vi: "Hoàn tất 100%",
      ko: "100% 준비 완료"
    },
    "Question 1 of 4: Profile": {
      es: "Pregunta 1 de 4: Perfil",
      zh: "第 1 题（共 4 题）：基本情况",
      tl: "Tanong 1 sa 4: Impormasyon",
      vi: "Câu hỏi 1 / 4: Đối tượng",
      ko: "1단계 / 4단계: 대상자"
    },
    "Question 2 of 4: Cognitive Health": {
      es: "Pregunta 2 de 4: Salud Cognitiva",
      zh: "第 2 题（共 4 题）：认知与记忆状况",
      tl: "Tanong 2 sa 4: Kalusugang Pangkaisipan",
      vi: "Câu hỏi 2 / 4: Trí nhớ & Nhận thức",
      ko: "2단계 / 4단계: 인지 및 기억 상태"
    },
    "Question 3 of 4: Physical Assistance": {
      es: "Pregunta 3 de 4: Asistencia Física",
      zh: "第 3 题（共 4 题）：身体日常照护需求",
      tl: "Tanong 3 sa 4: Pisikal na Tulong",
      vi: "Câu hỏi 3 / 4: Hỗ trợ thể chất",
      ko: "3단계 / 4단계: 신체 활동 지원"
    },
    "Question 4 of 4: Timeline": {
      es: "Pregunta 4 de 4: Plazo",
      zh: "第 4 题（共 4 题）：入住时间安排",
      tl: "Tanong 4 sa 4: Takdang Panahon",
      vi: "Câu hỏi 4 / 4: Thời gian dự kiến",
      ko: "4단계 / 4단계: 입소 희망 시기"
    },
    "Question 1 of 4: Who are you exploring care for?": {
      es: "Pregunta 1 de 4: ¿Para quién busca cuidado?",
      zh: "第 1 题（共 4 题）：您为哪位亲友寻找照护？",
      tl: "Tanong 1 sa 4: Para kanino ninyo hinahanap ang pag-aalaga?",
      vi: "Câu hỏi 1 / 4: Bạn đang tìm nơi chăm sóc cho ai?",
      ko: "1단계: 누구를 위한 돌봄을 찾고 계신가요?"
    },
    "Who are you exploring care for?": {
      es: "¿Para quién busca cuidado?",
      zh: "您为哪位亲友寻找照护？",
      tl: "Para kanino ninyo hinahanap ang pag-aalaga?",
      vi: "Bạn đang tìm nơi chăm sóc cho ai?",
      ko: "누구를 위한 돌봄을 찾고 계신가요?"
    },
    "Elder Parent or Relative": {
      es: "Padre, madre o familiar mayor",
      zh: "年迈父母或亲属",
      tl: "Nakatatandang Magulang o Kamag-anak",
      vi: "Cha mẹ hoặc người thân cao tuổi",
      ko: "연로하신 부모님 또는 친척"
    },
    "Looking after Mom, Dad, or elderly family member.": {
      es: "Cuidando a mamá, papá o a un familiar mayor.",
      zh: "照顾父亲、母亲或家中长辈。",
      tl: "Nag-aalaga kay Nanay, Tatay, o nakatatandang kapamilya.",
      vi: "Chăm sóc cho cha, mẹ hoặc người thân lớn tuổi.",
      ko: "어머니, 아버지 또는 연로하신 가족분을 위한 탐색"
    },
    "Caring for Mom, Dad, or elder relative": {
      es: "Cuidando a mamá, papá o familiar mayor",
      zh: "为父母或家中长辈安排照护",
      tl: "Para kay Nanay, Tatay, o nakatatandang kamag-anak",
      vi: "Chăm sóc cho cha mẹ hoặc người thân",
      ko: "부모님 또는 연로하신 친척을 위한 돌봄"
    },
    "Spouse or Partner": {
      es: "Cónyuge o pareja",
      zh: "配偶或伴侣",
      tl: "Asawa o Katuwang",
      vi: "Vợ/chồng hoặc bạn đời",
      ko: "배우자 또는 파트너"
    },
    "Seeking support for partner's health progression.": {
      es: "Buscando apoyo ante el avance de salud de su pareja.",
      zh: "随着伴侣健康变化而寻求更多照护支持。",
      tl: "Naghahanap ng suporta para sa nagbabagong kalusugan ng kapareha.",
      vi: "Tìm hỗ trợ khi sức khỏe của bạn đời thay đổi.",
      ko: "배우자의 건강 상태 변화에 맞춘 지원 모색"
    },
    "Seeking support for partner's health progression": {
      es: "Buscando apoyo para la salud de su pareja",
      zh: "随着伴侣健康状况变化寻求支持",
      tl: "Para sa nagbabagong kalusugan ng asawa",
      vi: "Tìm hỗ trợ theo tình trạng sức khỏe của bạn đời",
      ko: "배우자의 건강 변화에 따른 돌봄 지원"
    },
    "Myself": {
      es: "Para mí mismo(a)",
      zh: "为我自己规划",
      tl: "Para sa Aking Sarili",
      vi: "Cho bản thân tôi",
      ko: "본인"
    },
    "Planning forward for my own future community.": {
      es: "Planificando con anticipación mi futura comunidad.",
      zh: "提前为自己规划未来的理想照护居所。",
      tl: "Nagpaplano nang maaga para sa sariling tirahan sa hinaharap.",
      vi: "Lên kế hoạch trước cho nơi ở tương lai của bản thân.",
      ko: "미래의 주거 환경을 위한 사전 계획"
    },
    "Planning forward for my own future residence": {
      es: "Planificando mi futura residencia",
      zh: "为自己提前规划未来居住社区",
      tl: "Pagpaplano ng sariling tirahan sa hinaharap",
      vi: "Lên kế hoạch trước cho nơi an cư tương lai",
      ko: "본인의 향후 거주 환경 사전 계획"
    },
    "Social Worker / Discharge Planner": {
      es: "Trabajador Social / Alta Hospitalaria",
      zh: "社工 / 医院出院协调员",
      tl: "Social Worker / Tagapagplano ng Paglabas sa Ospital",
      vi: "Nhân viên Xã hội / Điều phối Xuất viện",
      ko: "사회복지사 / 병원 퇴원 담당자"
    },
    "Helping a patient transition safely from hospital.": {
      es: "Ayudando a un paciente en una transición segura desde el hospital.",
      zh: "协助患者从医院安全平稳地过渡到照护机构。",
      tl: "Tumutulong sa ligtas na paglipat ng pasyente mula sa ospital.",
      vi: "Hỗ trợ bệnh nhân chuyển tiếp an toàn sau xuất viện.",
      ko: "환자의 안전한 병원 퇴원 및 연계 지원"
    },
    "Hospital / rehab safe discharge placement": {
      es: "Ubicación segura tras alta hospitalaria o rehabilitación",
      zh: "协助医院/康复中心患者安全出院安置",
      tl: "Ligtas na paglipat mula sa ospital o rehab",
      vi: "Bố trí nơi ở an toàn sau bệnh viện / phục hồi chức năng",
      ko: "병원·재활시설 퇴원 후 안전 연계"
    },
    "Back to Question 1": {
      es: "Volver a la Pregunta 1",
      zh: "返回第 1 题",
      tl: "Bumalik sa Tanong 1",
      vi: "Quay lại Câu 1",
      ko: "1번 문항으로 돌아가기"
    },
    "Back to Question 2": {
      es: "Volver a la Pregunta 2",
      zh: "返回第 2 题",
      tl: "Bumalik sa Tanong 2",
      vi: "Quay lại Câu 2",
      ko: "2번 문항으로 돌아가기"
    },
    "Back to Question 3": {
      es: "Volver a la Pregunta 3",
      zh: "返回第 3 题",
      tl: "Bumalik sa Tanong 3",
      vi: "Quay lại Câu 3",
      ko: "3번 문항으로 돌아가기"
    },
    "Question 2 of 4: What is their primary cognitive and memory status?": {
      es: "Pregunta 2 de 4: ¿Cuál es su estado cognitivo y de memoria principal?",
      zh: "第 2 题（共 4 题）：长者目前的认知与记忆状况如何？",
      tl: "Tanong 2 sa 4: Ano ang pangunahing kalagayan ng kanilang pag-iisip at memorya?",
      vi: "Câu hỏi 2 / 4: Tình trạng nhận thức và trí nhớ hiện tại thế nào?",
      ko: "2단계: 현재 인지 및 기억 상태는 어떠한가요?"
    },
    "What is their primary cognitive and memory status?": {
      es: "¿Cuál es su estado cognitivo y de memoria principal?",
      zh: "长者目前的认知与记忆状况如何？",
      tl: "Ano ang kalagayan ng kanilang pag-iisip at memorya?",
      vi: "Tình trạng nhận thức và trí nhớ hiện tại ra sao?",
      ko: "현재 인지 및 기억 상태는 어떠한가요?"
    },
    "Sharp & Clear Cognitively": {
      es: "Mente lúcida y clara",
      zh: "思维清晰敏捷",
      tl: "Matalas at Malinaw ang Pag-iisip",
      vi: "Minh mẫn và tỉnh táo",
      ko: "인지 및 판단력 양호"
    },
    "Alert, manages conversations, no wandering or severe memory lapses.": {
      es: "Alerta, mantiene conversaciones, sin deambulación ni fallos graves de memoria.",
      zh: "头脑清醒，可正常交流，无走失或严重记忆障碍。",
      tl: "Alerto, nakikipag-usap nang maayos, walang paglalagalag o matinding paglimot.",
      vi: "Tỉnh táo, giao tiếp tốt, không đi lạc hay suy giảm trí nhớ nặng.",
      ko: "대화 소통이 원활하고 배회나 심한 기억력 저하가 없음"
    },
    "Alert, manages conversations, no wandering or severe memory confusion": {
      es: "Alerta, conversa con claridad, sin deambulación ni confusión severa",
      zh: "头脑清醒、交流顺畅，无走失或严重记忆混乱",
      tl: "Alerto, maayos makipag-usap, walang paglalagalag o pagkalito",
      vi: "Tỉnh táo, trò chuyện bình thường, không đi lạc hay lẫn nặng",
      ko: "대화 가능하며 배회나 심각한 혼란 증상이 없음"
    },
    "Mild Forgetfulness / Age-Related Memory Loss": {
      es: "Olvidos leves / pérdida de memoria por edad",
      zh: "轻度健忘 / 年龄相关的记忆减退",
      tl: "Bahagyang Pagkalimot / Paghina ng Memorya Dahil sa Edad",
      vi: "Hay quên nhẹ / suy giảm trí nhớ theo tuổi",
      ko: "경미한 건망증 / 노화성 기억력 저하"
    },
    "Mild Forgetfulness / Age-Related Memory Lapses": {
      es: "Olvidos leves / lapsos de memoria por edad",
      zh: "轻度健忘 / 偶尔记忆疏漏",
      tl: "Bahagyang Pagkalimot Dahil sa Edad",
      vi: "Hay quên nhẹ theo tuổi tác",
      ko: "경미한 건망증 / 가벼운 기억 착오"
    },
    "Occasionally forgets medications or dates, but remains oriented to surroundings.": {
      es: "Olvida ocasionalmente medicamentos o fechas, pero se mantiene orientado.",
      zh: "偶尔忘记服药或日期，但对周围环境仍有清楚认知。",
      tl: "Paminsan-minsang nakakalimutan ang gamot o petsa, ngunit alam pa rin ang paligid.",
      vi: "Thỉnh thoảng quên thuốc hoặc ngày tháng, nhưng vẫn nhận biết xung quanh.",
      ko: "가끔 약이나 날짜를 잊지만 주변 환경과 장소는 잘 인지함"
    },
    "Occasionally forgets medications or dates, but oriented to surroundings": {
      es: "Olvida a veces medicamentos o fechas, pero sigue orientado",
      zh: "偶尔忘记服药或日期，但对环境仍清晰定向",
      tl: "Minsan nakakalimot ng gamot o petsa, pero pamilyar sa paligid",
      vi: "Đôi khi quên uống thuốc hoặc ngày tháng, nhưng vẫn tỉnh táo nhận biết",
      ko: "약·날짜를 가끔 잊지만 주변 상황 인지는 유지됨"
    },
    "Diagnosed Alzheimer's or Moderate Dementia": {
      es: "Alzheimer diagnosticado o demencia moderada",
      zh: "确诊阿尔茨海默症或中度失智症",
      tl: "Na-diagnose na Alzheimer's o Katamtamang Demensya",
      vi: "Được chẩn đoán Alzheimer hoặc Sa sút trí tuệ vừa",
      ko: "알츠하이머 진단 또는 중등도 치매"
    },
    "Diagnosed Alzheimer's or Moderate/Severe Dementia": {
      es: "Alzheimer diagnosticado o demencia moderada/severa",
      zh: "确诊阿尔茨海默症或中重度失智症",
      tl: "Na-diagnose na Alzheimer's o Malubhang Demensya",
      vi: "Alzheimer hoặc Sa sút trí tuệ mức vừa / nặng",
      ko: "알츠하이머 또는 중등도·중증 치매"
    },
    "Confusion, disorientation, risk of exit-seeking or getting lost, requires delayed egress.": {
      es: "Confusión, desorientación, riesgo de salir y perderse; requiere puertas con retardo de salida.",
      zh: "存在意识混淆、迷失方向或企图外出走失风险，需要延时安全门禁设施。",
      tl: "May pagkalito, panganib ng paglabas o pagkawala, kailangan ang delayed egress.",
      vi: "Hay nhầm lẫn, mất phương hướng, có nguy cơ đi lạc; cần cửa kiểm soát an toàn.",
      ko: "혼란, 지남력 저하, 배회·외출 위험이 있어 안전 출입 통제가 필요함"
    },
    "Confusion, disorientation, risk of exit-seeking/wandering, requires secured care": {
      es: "Confusión, desorientación, riesgo de deambulación; requiere entorno seguro",
      zh: "出现混淆、迷向或走失倾向，需要封闭安全看护环境",
      tl: "Pagkalito, panganib ng paglalagalag; kailangan ng ligtas at saradong lugar",
      vi: "Lẫn lộn, mất phương hướng, nguy cơ đi lạc; cần môi trường chăm sóc an toàn",
      ko: "혼란·배회 위험이 있어 안전한 치매 전문 케어 환경이 필요함"
    },
    "Question 3 of 4: What assistance is required with physical activities of daily living (ADLs)?": {
      es: "Pregunta 3 de 4: ¿Qué asistencia requiere en actividades físicas diarias (ADL)?",
      zh: "第 3 题（共 4 题）：在日常身体活动（ADL）方面需要哪些协助？",
      tl: "Tanong 3 sa 4: Anong tulong ang kailangan sa pang-araw-araw na gawain (ADLs)?",
      vi: "Câu hỏi 3 / 4: Cần hỗ trợ gì trong sinh hoạt thể chất hàng ngày (ADL)?",
      ko: "3단계: 일상생활 신체 활동(ADL)에 어느 정도 도움이 필요한가요?"
    },
    "What assistance is required with physical activities of daily living (ADLs)?": {
      es: "¿Qué asistencia física necesita diariamente (ADL)?",
      zh: "日常身体活动（ADL）需要哪些协助？",
      tl: "Anong pisikal na tulong ang kailangan araw-araw (ADLs)?",
      vi: "Cần hỗ trợ gì trong sinh hoạt hàng ngày (ADL)?",
      ko: "일상 신체 활동(ADL)에 어떤 지원이 필요한가요?"
    },
    "Independent / Minimal assistance": {
      es: "Independiente / asistencia mínima",
      zh: "生活自理 / 只需极少协助",
      tl: "Nakapag-iisa / Kaunting tulong lang",
      vi: "Tự lập / hỗ trợ tối thiểu",
      ko: "독립 생활 / 최소한의 도움"
    },
    "Walks without difficulty; just needs meal service, social outings, and medication distribution.": {
      es: "Camina sin dificultad; solo necesita comidas, salidas sociales y administración de medicinas.",
      zh: "行走无碍；仅需膳食安排、社交活动与按时发药。",
      tl: "Nakakalakad nang maayos; kailangan lang ng pagkain, aktibidad, at gamot.",
      vi: "Đi lại dễ dàng; chỉ cần phục vụ bữa ăn, sinh hoạt cộng đồng và chia thuốc.",
      ko: "보행이 자유로우며 식사, 여가 활동, 복약 관리 정도만 필요함"
    },
    "Walks easily; just needs meal service, companionship, and medication reminders": {
      es: "Camina con facilidad; solo necesita comidas, compañía y recordatorios de medicinas",
      zh: "行走自如；仅需膳食、陪伴及按时用药提醒",
      tl: "Madaling nakakalakad; kailangan lang ng pagkain, kasama, at paalala sa gamot",
      vi: "Đi lại thoải mái; chỉ cần bữa ăn, bạn đồng hành và nhắc uống thuốc",
      ko: "거동이 편하며 식사, 말벗, 복약 알림 정도가 필요함"
    },
    "Assistance with Bathing, Dressing, or Transfers": {
      es: "Ayuda para bañarse, vestirse o trasladarse",
      zh: "洗浴、穿衣或起身移位协助",
      tl: "Tulong sa Paliligo, Pagbibihis, o Paglipat",
      vi: "Hỗ trợ tắm rửa, mặc quần áo hoặc di chuyển",
      ko: "목욕, 옷 입기 또는 거동·이동 도움"
    },
    "Moderate Assistance (Bathing, Dressing, Transfers)": {
      es: "Asistencia moderada (baño, vestirse, traslados)",
      zh: "中度协助（洗浴、穿衣、起身移位）",
      tl: "Katamtamang Tulong (Paliligo, Pagbibihis, Paglipat)",
      vi: "Hỗ trợ vừa (Tắm, mặc đồ, di chuyển)",
      ko: "중등도 지원 (목욕, 착의, 이동 보조)"
    },
    "Uses walker or wheelchair, needs 1-person physical help getting in/out of bed or shower.": {
      es: "Usa andador o silla de ruedas; necesita apoyo físico de 1 persona para cama o ducha.",
      zh: "使用助行器或轮椅，上下床或淋浴需要 1 名护工搀扶。",
      tl: "Gumagamit ng walker o wheelchair; kailangan ng 1 tagapag-alaga sa kama o paliguan.",
      vi: "Dùng khung tập đi hoặc xe lăn; cần 1 người đỡ lên xuống giường hoặc tắm.",
      ko: "보행기·휠체어를 사용하며 침대나 샤워 시 1명의 신체 보조가 필요함"
    },
    "Uses walker or wheelchair; needs 1 caregiver for showers or getting out of bed": {
      es: "Usa andador o silla de ruedas; necesita 1 cuidador para ducharse o levantarse",
      zh: "使用助行器或轮椅；洗澡或下床需要 1 名护工协助",
      tl: "May walker o wheelchair; kailangan ng 1 caregiver sa paliligo o pagbangon",
      vi: "Dùng khung đi hoặc xe lăn; cần 1 người hỗ trợ tắm hoặc ra khỏi giường",
      ko: "보행기·휠체어 사용, 샤워 및 기상 시 요양보호사 1명 지원 필요"
    },
    "Bedridden / Total Dependence / Incontinence": {
      es: "Postrado / Dependencia total / Incontinencia",
      zh: "长期卧床 / 完全依赖 / 失禁护理",
      tl: "Nakaratay / Ganap na Pag-asa / Incontinence",
      vi: "Nằm liệt giường / phụ thuộc hoàn toàn / mất kiểm soát vệ sinh",
      ko: "와상 상태 / 전적 의존 / 실금 케어"
    },
    "High Acuity / Bedridden / Total Dependence": {
      es: "Alta complejidad / Postrado / Dependencia total",
      zh: "高强度照护 / 卧床 / 完全依赖",
      tl: "Matinding Pangangalaga / Nakaratay / Ganap na Umaasa",
      vi: "Mức độ nặng / Nằm giường / Phụ thuộc hoàn toàn",
      ko: "고중증 / 와상 / 전면적 돌봄 필요"
    },
    "Non-ambulatory, frequent turning, hoyer lift or 2-person transfer, or hospice waiver care.": {
      es: "No ambulatorio, cambios de posición frecuentes, grúa Hoyer o traslado de 2 personas o exención de hospicio.",
      zh: "无法自行移动，需定时翻身、移位机或双人抱抬，或需临终关怀豁免服务。",
      tl: "Hindi makalakad, madalas na pagpihit, hoyer lift o 2-taong pagbuhat, o hospice waiver care.",
      vi: "Không tự đi lại, cần xoay trở thường xuyên, máy nâng hoặc 2 người chuyển, hoặc chăm sóc cuối đời.",
      ko: "거동 불가로 잦은 체위 변경, 호이어 리프트·2인 이동 또는 호스피스 돌봄이 필요함"
    },
    "Non-ambulatory, frequent turning, hoyer lift or 2-person assist, hospice waiver": {
      es: "No ambulatorio, cambios de posición, grúa o 2 personas, exención de hospicio",
      zh: "无法行走、定期翻身、移位机或双人协助及临终关怀支持",
      tl: "Hindi makalakad, palagiang pagbaling, hoyer lift o 2 tao, hospice waiver",
      vi: "Không tự đi, xoay trở thường xuyên, cần 2 người đỡ hoặc chăm sóc cuối đời",
      ko: "보행 불가, 체위 변경, 리프트 또는 2인 보조, 호스피스 지원 필요"
    },
    "Question 4 of 4: How soon is care needed?": {
      es: "Pregunta 4 de 4: ¿En cuánto tiempo necesitan el cuidado?",
      zh: "第 4 题（共 4 题）：大约何时需要入住？",
      tl: "Tanong 4 sa 4: Gaano kabilis kailangan ang pag-aalaga?",
      vi: "Câu hỏi 4 / 4: Khi nào cần dịch vụ chăm sóc?",
      ko: "4단계: 언제쯤 입소가 필요하신가요?"
    },
    "How soon is care needed?": {
      es: "¿En cuánto tiempo necesitan el cuidado?",
      zh: "大约何时需要入住？",
      tl: "Gaano kabilis kailangan ang pag-aalaga?",
      vi: "Khi nào bạn cần dịch vụ chăm sóc?",
      ko: "언제쯤 입소가 필요하신가요?"
    },
    "Immediate / Hospital Discharge": {
      es: "Inmediato / Alta Hospitalaria",
      zh: "紧急 / 即将出院安置",
      tl: "Agaran / Paglabas sa Ospital",
      vi: "Khẩn cấp / Xuất viện ngay",
      ko: "즉시 / 병원 퇴원 예정"
    },
    "Immediate / Hospital Discharge (Within 1–7 Days)": {
      es: "Inmediato / Alta Hospitalaria (En 1–7 días)",
      zh: "紧急 / 医院出院（1–7 天内）",
      tl: "Agaran / Paglabas sa Ospital (Sa loob ng 1–7 Araw)",
      vi: "Khẩn cấp / Xuất viện (Trong 1–7 ngày)",
      ko: "즉시 / 병원 퇴원 (1~7일 이내)"
    },
    "Within 1–7 days.": {
      es: "En un plazo de 1 a 7 días.",
      zh: "1 至 7 天内。",
      tl: "Sa loob ng 1–7 araw.",
      vi: "Trong vòng 1–7 ngày tới.",
      ko: "1~7일 이내."
    },
    "Urgent transition needing expedited bed placement and physician review": {
      es: "Transición urgente que requiere cama inmediata y evaluación médica",
      zh: "需加急落实空余床位与医生健康评估",
      tl: "Apurahang paglipat na nangangailangan ng mabilisang kama at pagsusuri ng doktor",
      vi: "Chuyển tiếp khẩn cần giường trống ngay và bác sĩ đánh giá nhanh",
      ko: "긴급 병상 확보 및 의사 평가서 신속 처리가 필요한 상황"
    },
    "Next 30–60 Days": {
      es: "Próximos 30–60 días",
      zh: "未来 30–60 天内",
      tl: "Susunod na 30–60 Araw",
      vi: "30–60 ngày tới",
      ko: "향후 30~60일 이내"
    },
    "Planning a smooth transition.": {
      es: "Planificando una transición tranquila.",
      zh: "稳步规划平稳过渡。",
      tl: "Pinaplano nang maayos ang paglipat.",
      vi: "Lên kế hoạch chuyển tiếp nhẹ nhàng.",
      ko: "여유 있고 순조로운 입소 준비 중"
    },
    "Proactively planning a comfortable, unhurried transition": {
      es: "Planificando con tiempo una mudanza cómoda y sin prisas",
      zh: "从容规划舒适、不仓促的入住过渡",
      tl: "Maagap na nagpaplano ng komportableng paglipat",
      vi: "Chủ động chuẩn bị chuyển nơi ở thoải mái, không vội vàng",
      ko: "무리 없이 편안한 입소 전환을 미리 계획 중"
    },
    "Future Research": {
      es: "Investigación a futuro",
      zh: "前期了解与规划",
      tl: "Pananaliksik para sa Hinaharap",
      vi: "Tìm hiểu cho tương lai",
      ko: "향후 대비 사전 조사"
    },
    "Future Research & Budget Planning": {
      es: "Investigación futura y presupuesto",
      zh: "未来规划与预算评估",
      tl: "Pananaliksik at Pagpaplano ng Badyet",
      vi: "Tìm hiểu & dự trù ngân sách",
      ko: "사전 정보 탐색 및 예산 계획"
    },
    "Just learning options.": {
      es: "Solo conociendo opciones.",
      zh: "先了解可行方案。",
      tl: "Nag-aaral pa lang ng mga opsyon.",
      vi: "Đang tìm hiểu trước các lựa chọn.",
      ko: "가능한 옵션들을 미리 살펴보는 단계"
    },
    "Gathering pricing, options, and understanding California licensing levels": {
      es: "Reuniendo precios, opciones y niveles de licencia en California",
      zh: "收集费用行情、对比方案并了解加州照护牌照等级",
      tl: "Nangangalap ng presyo, opsyon, at antas ng lisensya sa California",
      vi: "Thu thập thông tin giá cả, lựa chọn và cấp độ giấy phép tại California",
      ko: "비용 비교 및 캘리포니아 인허가 시설 등급 사전 파악"
    },
    "Custom Recommendation": {
      es: "Recomendación Personalizada",
      zh: "为您定制的专属建议",
      tl: "Pasadyang Rekomendasyon",
      vi: "Đề Xuất Riêng Cho Bạn",
      ko: "맞춤 추천 결과"
    },
    "Residential 6-Bed Care Home (RCFE / Board & Care)": {
      es: "Casa de Cuidado Residencial de 6 Camas (RCFE / Board & Care)",
      zh: "6 床位家庭式老年照护之家（RCFE / Board & Care）",
      tl: "6-Bed Residential Care Home (RCFE / Board & Care)",
      vi: "Nhà Chăm Sóc Gia Đình 6 Giường (RCFE / Board & Care)",
      ko: "6인실 소규모 주거형 요양홈 (RCFE / Board & Care)"
    },
    "Based on your answers, an intimate residential care home provides the ideal 1-to-3 caregiver ratio, continuous eyes-on supervision, and lower sensory stimulation compared to large institutional facilities.": {
      es: "Según sus respuestas, un hogar residencial íntimo ofrece la proporción ideal de 1 cuidador por cada 3 residentes, supervisión continua y menos sobreestimulación sensorial frente a grandes instituciones.",
      zh: "根据您的回答，小规模家庭式照护之家能提供理想的 1 对 3 护患比、持续贴身看护，并比大型机构更安静温和、减少感官刺激。",
      tl: "Batay sa inyong mga sagot, ang maliit na residential care home ay nagbibigay ng perpektong 1-sa-3 na bilang ng tagapag-alaga, tuloy-tuloy na pagbabantay, at mas tahimik na kapaligiran kumpara sa malalaking institusyon.",
      vi: "Dựa trên câu trả lời của bạn, nhà chăm sóc quy mô nhỏ mang lại tỷ lệ lý tưởng 1 nhân viên chăm 3 cụ, theo dõi sát sao liên tục và yên tĩnh hơn nhiều so với cơ sở lớn.",
      ko: "응답하신 내용을 바탕으로 볼 때, 1대3의 밀착 케어 비율과 상시 보호 관찰, 대형 시설보다 차분하고 아늑한 환경이 어우러진 6인실 주거형 요양홈이 가장 적합합니다."
    },
    "Your loved one is best served by an intimate residential board-and-care home offering 24-hour awake assistance for dressing, bathing, medication management, and warm home-cooked meals in a cozy family neighborhood.": {
      es: "Su ser querido estará mejor atendido en un hogar residencial íntimo (board-and-care) que ofrece asistencia despierta las 24 horas para vestirse, bañarse, control de medicamentos y comidas caseras en un tranquilo vecindario familiar.",
      zh: "您的亲人最适合入住温馨的小型家庭式照护之家（Board & Care），在安静熟悉的住宅社区中享受 24 小时清醒值守照护，包括穿衣、洗浴协助、用药管理及热腾腾的家常膳食。",
      tl: "Pinakamainam para sa inyong mahal sa buhay ang isang maliit na residential board-and-care home na nag-aalok ng 24-oras na gising na tulong sa pagbibihis, paliligo, pamamahala ng gamot, at lutong-bahay na pagkain sa isang tahimik na komunidad.",
      vi: "Người thân của bạn sẽ được chăm sóc tốt nhất tại một nhà chăm sóc gia đình ấm cúng (board-and-care) với nhân viên thức trực 24/24 hỗ trợ mặc đồ, tắm rửa, quản lý thuốc và các bữa ăn nấu tại nhà trong khu dân cư yên tĩnh.",
      ko: "어르신께는 조용한 일반 주택가에서 옷 입기, 목욕, 복약 관리 및 따뜻한 가정식 식사를 24시간 상주 인력이 세심히 돌봐드리는 소규모 주거형 요양홈(Board & Care)이 가장 잘 맞습니다."
    },
    "Urgent Placement / Hospital Discharge Notice": {
      es: "Aviso de Ubicación Urgente / Alta Hospitalaria",
      zh: "紧急入住 / 医院出院提示",
      tl: "Abiso para sa Agarang Paglipat / Paglabas ng Ospital",
      vi: "Thông Báo Tìm Chỗ Khẩn / Xuất Viện",
      ko: "긴급 입소 / 병원 퇴원 안내"
    },
    "Hospital Discharge / Urgent Placement Alert": {
      es: "Alerta de Alta Hospitalaria / Ubicación Urgente",
      zh: "出院紧急安置提醒",
      tl: "Babala sa Agarang Paglabas ng Ospital",
      vi: "Cảnh Báo Xuất Viện / Nhập Viện Khẩn",
      ko: "병원 퇴원 / 긴급 입소 알림"
    },
    "Key Questions to Ask on Your First Tour:": {
      es: "Preguntas clave para hacer en su primera visita:",
      zh: "首次实地参观时必问的关键问题：",
      tl: "Mahahalagang Tanong sa Inyong Unang Pagbisita:",
      vi: "Những Câu Hỏi Quan Trọng Khi Tham Quan Lần Đầu:",
      ko: "첫 시설 방문 시 꼭 확인해야 할 질문:"
    },
    "Does the home have a currently active CDSS Hospice Waiver and Bedridden Clearance?": {
      es: "¿Cuenta el hogar con Exención de Hospicio y Autorización para Postrados vigentes ante el CDSS?",
      zh: "该机构是否持有现行有效的 CDSS 临终关怀豁免（Hospice Waiver）与卧床看护许可？",
      tl: "May aktibo bang CDSS Hospice Waiver at Bedridden Clearance ang tahanan?",
      vi: "Cơ sở hiện có Giấy miễn trừ Chăm sóc Cuối đời (Hospice Waiver) và phép nhận người nằm giường của CDSS không?",
      ko: "해당 시설이 현재 유효한 CDSS 호스피스 면제(Hospice Waiver)와 와상 입소 승인을 보유하고 있나요?"
    },
    "Is there an awake caregiver on shift throughout the entire night?": {
      es: "¿Hay un cuidador despierto de turno durante toda la noche?",
      zh: "夜间值班的照护人员是否整夜保持清醒看护？",
      tl: "May gising bang tagapag-alaga na naka-duty buong gabi?",
      vi: "Ban đêm có nhân viên trực thức suốt ca không?",
      ko: "야간 시간대 내내 깨어 근무하는 전담 직원이 상주하나요?"
    },
    "Are medications stored in double-locked cabinets and administered strictly per doctor orders?": {
      es: "¿Los medicamentos se guardan bajo doble llave y se administran estrictamente según receta médica?",
      zh: "药品是否存放在双锁药柜中，并严格遵照医嘱给药？",
      tl: "Nakaimbak ba ang mga gamot sa double-locked na kabinet at ibinibigay ayon sa utos ng doktor?",
      vi: "Thuốc có được cất giữ trong tủ khóa hai lớp và cấp phát đúng y lệnh bác sĩ không?",
      ko: "약품이 이중 잠금 캐비닛에 보관되며 의사 처방대로 엄격하게 투약되나요?"
    },
    "Retake Assessment": {
      es: "Repetir evaluación",
      zh: "重新评估",
      tl: "Ulitin ang Pagsusuri",
      vi: "Làm lại đánh giá",
      ko: "진단 다시 하기"
    },
    "Schedule Placement Call": {
      es: "Programar llamada de ubicación",
      zh: "预约安置通话",
      tl: "Mag-iskedyul ng Tawag",
      vi: "Đặt lịch gọi tư vấn",
      ko: "입소 상담 전화 예약"
    },
    "Email My Care Plan": {
      es: "Enviar plan por correo",
      zh: "通过表单发送方案",
      tl: "I-email ang Aking Care Plan",
      vi: "Gửi kế hoạch qua biểu mẫu",
      ko: "케어 플랜 이메일 전송"
    },
    "Book Free Advisory Call": {
      es: "Reservar llamada gratuita",
      zh: "预约免费顾问通话",
      tl: "Mag-book ng Libreng Tawag",
      vi: "Đặt lịch gọi tư vấn miễn phí",
      ko: "무료 상담 전화 예약"
    },
    "Email Care Plan to Advisor": {
      es: "Enviar plan al asesor",
      zh: "将照护方案发给顾问",
      tl: "Ipadala ang Care Plan sa Tagapayo",
      vi: "Gửi kế hoạch cho chuyên viên",
      ko: "상담사에게 케어 플랜 보내기"
    },
    "California Title 22 Licensing Guide": {
      es: "Guía de Licenciamiento Título 22 de California",
      zh: "加州 Title 22 牌照审批指南",
      tl: "Gabay sa Pagkuha ng Lisensyang California Title 22",
      vi: "Hướng Dẫn Cấp Phép Title 22 California",
      ko: "캘리포니아 Title 22 인허가 가이드"
    },
    "4-Stage RCFE Licensure Roadmap": {
      es: "Ruta de Licenciamiento RCFE en 4 Etapas",
      zh: "RCFE 牌照申请四阶段路线图",
      tl: "4 na Yugto ng Pagkuha ng Lisensyang RCFE",
      vi: "Lộ Trình 4 Giai Đoạn Xin Giấy Phép RCFE",
      ko: "RCFE 인허가 4단계 로드맵"
    },
    "A step-by-step timeline from business inception to accepting your first resident.": {
      es: "Un cronograma paso a paso desde el inicio del proyecto hasta recibir a su primer residente.",
      zh: "从项目起步到迎来首位入住长者的分步时间表。",
      tl: "Hakbang-hakbang na gabay mula sa pagsisimula hanggang sa pagtanggap ng unang residente.",
      vi: "Lộ trình từng bước từ lúc khởi tạo đến khi đón cư dân đầu tiên.",
      ko: "사업 준비 시작부터 첫 입소 어르신을 맞이할 때까지의 단계별 일정입니다."
    },
    "Stage 1: Administrator Certification & Prerequisites": {
      es: "Etapa 1: Certificación de Administrador y Requisitos",
      zh: "第一阶段：管理员认证与前置准备",
      tl: "Yugto 1: Sertipikasyon ng Administrator at Mga Pangangailangan",
      vi: "Giai đoạn 1: Chứng chỉ Quản trị viên & Điều kiện tiên quyết",
      ko: "1단계: 관리자 자격 취득 및 사전 요건"
    },
    "Weeks 1–6": {
      es: "Semanas 1–6",
      zh: "第 1–6 周",
      tl: "Linggo 1–6",
      vi: "Tuần 1–6",
      ko: "1~6주차"
    },
    "Complete mandatory 80-hour state-approved RCFE Administrator training, pass the California Department of Social Services (CDSS) state examination with 70%+, and obtain DOJ/FBI LiveScan fingerprint clearances.": {
      es: "Complete la capacitación estatal obligatoria de 80 horas para Administrador RCFE, apruebe el examen del CDSS con 70%+ y obtenga las verificaciones de huellas LiveScan ante DOJ/FBI.",
      zh: "完成加州批准的 80 小时 RCFE 管理员必修培训，以 70% 及以上成绩通过 CDSS 州立考试，并完成 DOJ/FBI LiveScan 指纹背景审查。",
      tl: "Tapusin ang mandatoryong 80-oras na pagsasanay ng RCFE Administrator, ipasa ang pagsusulit ng CDSS (70%+), at kumuha ng DOJ/FBI LiveScan fingerprint clearance.",
      vi: "Hoàn thành khóa đào tạo Quản trị viên RCFE bắt buộc 80 giờ, thi đỗ kỳ thi CDSS (từ 70% trở lên) và hoàn tất lấy dấu vân tay DOJ/FBI LiveScan.",
      ko: "주정부 승인 80시간 RCFE 관리자 필수 교육을 이수하고 CDSS 주정부 시험을 70% 이상으로 통과한 뒤 DOJ/FBI LiveScan 지문 신원조회를 완료합니다."
    },
    "Stage 2: Real Estate & STD 850 Fire Clearance": {
      es: "Etapa 2: Inmueble y Aprobación de Bomberos STD 850",
      zh: "第二阶段：选址定房与 STD 850 消防许可",
      tl: "Yugto 2: Ari-arian at STD 850 Fire Clearance",
      vi: "Giai đoạn 2: Bất động sản & Giấy phép PCCC STD 850",
      ko: "2단계: 부동산 확보 및 STD 850 소방 승인"
    },
    "Weeks 6–14": {
      es: "Semanas 6–14",
      zh: "第 6–14 周",
      tl: "Linggo 6–14",
      vi: "Tuần 6–14",
      ko: "6~14주차"
    },
    "Secure a residential single-family home. Coordinate local zoning compliance, smoke detector interconnectivity, fire extinguishers, emergency exit pathways, and schedule city/county fire marshal inspection for Form STD 850 approval.": {
      es: "Asegure una vivienda unifamiliar residencial. Gestione la zonificación local, detectores de humo interconectados, extintores, salidas de emergencia y programe la inspección del jefe de bomberos para aprobar el Formulario STD 850.",
      zh: "选定独栋住宅物业，协调市政分区合规、联动烟雾报警器、灭火器与紧急逃生通道改造，并预约市/县消防局验收以获批 STD 850 表格。",
      tl: "Kumuha ng single-family residential home. Ayusin ang local zoning, magkakaugnay na smoke detector, fire extinguisher, emergency exit, at inspeksyon ng bumbero para sa Form STD 850.",
      vi: "Thuê hoặc mua nhà đơn lập phù hợp. Chuẩn bị quy hoạch địa phương, báo khói liên kết, bình chữa cháy, lối thoát hiểm và đặt lịch thanh tra PCCC xin mẫu STD 850.",
      ko: "단독주택 부지를 확보하고 지역 용도 규정을 확인한 뒤, 연동형 화재 감지기, 소화기, 비상 탈출 동선을 갖추어 관할 소방관의 STD 850 점검을 받습니다."
    },
    "Stage 3: Application Submission (LIC 200 & Policies)": {
      es: "Etapa 3: Envío de Solicitud (LIC 200 y Políticas)",
      zh: "第三阶段：正式递交申请（LIC 200 与管理制度）",
      tl: "Yugto 3: Pagsusumite ng Aplikasyon (LIC 200 at Mga Patakaran)",
      vi: "Giai đoạn 3: Nộp Hồ Sơ Đăng Ký (LIC 200 & Chính sách)",
      ko: "3단계: 인허가 신청서 접수 (LIC 200 및 규정집)"
    },
    "Weeks 14–22": {
      es: "Semanas 14–22",
      zh: "第 14–22 周",
      tl: "Linggo 14–22",
      vi: "Tuần 14–22",
      ko: "14~22주차"
    },
    "Assemble the complete LIC 200 packet with all attachments: Financial Solvency (LIC 401), Disaster Plan (LIC 610E), Admission Agreements, Program of Activities, Theft & Loss policies, and submit non-refundable state fees.": {
      es: "Integre el paquete LIC 200 completo con todos sus anexos: Solvencia Financiera (LIC 401), Plan de Desastres (LIC 610E), Contratos de Admisión, Programa de Actividades, Políticas de Pérdidas y pague las tarifas estatales.",
      zh: "整理全套 LIC 200 申请包及附件：财务偿付能力表（LIC 401）、灾害应急计划（LIC 610E）、入住协议、活动方案、防盗遗失制度，并缴纳不可退还的州政府申请费。",
      tl: "Buuin ang kumpletong LIC 200 packet kasama ang Financial Solvency (LIC 401), Disaster Plan (LIC 610E), Admission Agreements, Program of Activities, Theft & Loss policies, at bayad sa estado.",
      vi: "Hoàn chỉnh bộ hồ sơ LIC 200 cùng phụ lục: Năng lực tài chính (LIC 401), Kế hoạch thảm họa (LIC 610E), Hợp đồng nhập viện, Chương trình sinh hoạt, Chính sách bảo vệ tài sản và nộp lệ phí tiểu bang.",
      ko: "재정 건전성 서류(LIC 401), 재난 대응 계획(LIC 610E), 입소 계약서, 활동 프로그램, 도난·분실 규정 등을 포함한 LIC 200 전체 서류와 주정부 접수비를 제출합니다."
    },
    "Stage 4: Component III & Pre-Licensing Inspection": {
      es: "Etapa 4: Componente III e Inspección Previa",
      zh: "第四阶段：Component III 面谈与发牌前实地检查",
      tl: "Yugto 4: Component III at Inspeksyon Bago Maglisensya",
      vi: "Giai đoạn 4: Component III & Thanh Tra Trước Cấp Phép",
      ko: "4단계: Component III 인터뷰 및 최종 사전 실사"
    },
    "Weeks 22–28": {
      es: "Semanas 22–28",
      zh: "第 22–28 周",
      tl: "Linggo 22–28",
      vi: "Tuần 22–28",
      ko: "22~28주차"
    },
    "Attend the in-person Component III interview with your assigned Licensing Program Analyst (LPA). Pass the on-site physical plant inspection (hot water testing 105°–120°F, locked medications, first-aid, food reserves) and receive your license.": {
      es: "Asista a la entrevista presencial del Componente III con su analista LPA asignado. Apruebe la inspección física (temperatura de agua caliente 105°–120°F, medicamentos bajo llave, botiquín, reservas de alimentos) y reciba su licencia.",
      zh: "参加与指定牌照项目分析师（LPA）的 Component III 面对面访谈，并通过现场设施验收（热水温度 105°–120°F、药品上锁、急救箱与食品储备），随后正式取得牌照。",
      tl: "Dumalo sa Component III interview kasama ang inyong Licensing Program Analyst (LPA). Ipasa ang inspeksyon sa lugar (mainit na tubig 105°–120°F, naka-lock na gamot, first-aid, imbak na pagkain) at tanggapin ang lisensya.",
      vi: "Tham gia phỏng vấn trực tiếp Component III với Chuyên viên Cấp phép (LPA). Vượt qua kiểm tra thực địa (nước nóng 105°–120°F, tủ thuốc khóa, sơ cứu, thực phẩm dự trữ) để nhận giấy phép.",
      ko: "담당 인허가 심사관(LPA)과의 Component III 대면 인터뷰에 참석하고 현장 물리적 실사(온수 온도 105°–120°F, 잠금 약품함, 구급함, 비상 식량 등)를 통과해 최종 라이선스를 발급받습니다."
    },
    "Want Love RCFE to draft your policies and guide your inspection?": {
      es: "¿Desea que Love RCFE redacte sus políticas y lo prepare para su inspección?",
      zh: "希望由 Love RCFE 为您撰写全套制度并辅导验收吗？",
      tl: "Nais bang ipagawa sa Love RCFE ang inyong mga patakaran at paggabay sa inspeksyon?",
      vi: "Bạn muốn Love RCFE soạn quy trình và đồng hành trong buổi thanh tra?",
      ko: "운영 규정집 작성부터 현장 실사까지 Love RCFE의 전담 가이드를 받고 싶으신가요?"
    },
    "Discuss Operator Consulting": {
      es: "Hablar sobre consultoría",
      zh: "咨询运营商服务",
      tl: "Pag-usapan ang Operator Consulting",
      vi: "Trao đổi về tư vấn mở cơ sở",
      ko: "운영자 컨설팅 문의하기"
    },
    "Our Core Philosophy": {
      es: "Nuestra Filosofía Central",
      zh: "核心服务哲学",
      tl: "Aming Pangunahing Pilosopiya",
      vi: "Triết Lý Cốt Lõi",
      ko: "우리의 핵심 철학"
    },
    "Personal guidance, one deliberate step at a time.": {
      es: "Asesoría personal, un paso firme a la vez.",
      zh: "一对一专属陪伴，稳健走好每一步。",
      tl: "Personal na gabay, isang maingat na hakbang sa bawat pagkakataon.",
      vi: "Tư vấn tận tình, từng bước vững chắc.",
      ko: "신중하고 세심하게, 한 걸음씩 함께하는 맞춤 상담."
    },
    "We reject high-pressure referral factories. Every senior is someone's mother, father, or partner. Every care home operator is building a sanctuary for vulnerable elders. We ground our work in calm clarity and regulatory rigor.": {
      es: "Rechazamos las agencias impersonales de referencia masiva. Cada adulto mayor es la madre, padre o pareja de alguien. Cada operador construye un refugio para personas mayores vulnerables. Trabajamos con serenidad y rigor normativo.",
      zh: "我们坚决拒绝流水线式的压迫推销。每位长者都是某人的母亲、父亲或挚爱伴侣；每位护理之家运营者都在为高龄长者筑起安全港湾。我们以冷静清晰与严谨合规为立身之本。",
      tl: "Tinututulan namin ang mapilit na referral factories. Bawat nakatatanda ay nanay, tatay, o asawa ng isang pamilya. Bawat operator ay nagtatayo ng ligtas na kanlungan. Nakabatay ang aming gawain sa linaw at mahigpit na pagsunod sa batas.",
      vi: "Chúng tôi nói không với kiểu môi giới ép buộc hàng loạt. Mỗi cụ ông cụ bà đều là cha mẹ, bạn đời đáng kính của một gia đình. Chúng tôi làm việc bằng sự điềm tĩnh, minh bạch và chuẩn mực pháp lý cao.",
      ko: "저희는 기계적인 대량 알선 방식을 거부합니다. 모든 어르신은 누군가의 소중한 어머니이자 아버지, 배우자이며 모든 시설 운영자는 어르신의 안식처를 만드는 분들입니다. 차분한 명확성과 엄격한 규정 준수를 최우선으로 삼습니다."
    },
    "Our Independence Promise": {
      es: "Nuestro Compromiso de Independencia",
      zh: "独立客观承诺",
      tl: "Aming Pangako ng Pagiging Patas",
      vi: "Cam Kết Độc Lập & Khách Quan",
      ko: "독립성과 객관성에 대한 약속"
    },
    "We do not push facilities based on referral kickbacks. We inspect state citations, review physical cleanliness, and match care capabilities directly with resident health needs.": {
      es: "No impulsamos centros por comisiones ocultas. Revisamos infracciones estatales, limpieza física y comparamos la capacidad real de atención con las necesidades de salud del residente.",
      zh: "我们绝不因佣金高低而强推机构。我们核查官方违规记录、实地评估环境卫生，确保机构照护能力真正匹配长者健康所需。",
      tl: "Hindi kami nagtutulak ng pasilidad dahil sa mas mataas na komisyon. Sinusuri namin ang mga paglabag sa estado, kalinisan ng lugar, at tinutugma ang kakayahan sa kalusugan ng residente.",
      vi: "Chúng tôi không ưu tiên cơ sở dựa trên hoa hồng. Chúng tôi kiểm tra hồ sơ vi phạm, vệ sinh thực tế và đối chiếu đúng năng lực chăm sóc với tình trạng sức khỏe của cư dân.",
      ko: "소개 수수료에 따라 특정 시설을 밀어주지 않습니다. 주정부 시정 이력과 시설 청결도를 점검하고 어르신의 건강 상태에 실제로 부합하는 곳만 연결합니다."
    },
    "Tell us your story": {
      es: "Cuéntenos su historia",
      zh: "倾听您的故事与需求",
      tl: "Ibahagi ang inyong kwento",
      vi: "Chia sẻ câu chuyện của bạn",
      ko: "가족의 이야기를 들려주세요"
    },
    "We begin with a confidential discovery discussion. We listen to medical histories, family dynamics, geographic boundaries, or your entrepreneurial goals for an RCFE business.": {
      es: "Comenzamos con una conversación confidencial. Escuchamos el historial médico, la dinámica familiar, la zona geográfica preferida o sus metas emprendedoras para abrir un RCFE.",
      zh: "每次合作均从一场保密沟通开始。我们仔细聆听长者的病史、家庭考量、地理区域要求，或您创办 RCFE 机构的创业愿景。",
      tl: "Nagsisimula kami sa isang kumpidensyal na pag-uusap. Pinapakinggan namin ang medikal na kasaysayan, dinamiko ng pamilya, lokasyon, o layunin ninyo sa pagbubukas ng RCFE.",
      vi: "Mọi hành trình bắt đầu bằng một cuộc trao đổi bảo mật. Chúng tôi lắng nghe bệnh sử, hoàn cảnh gia đình, khu vực mong muốn hoặc mục tiêu kinh doanh RCFE của bạn.",
      ko: "비밀이 보장되는 초기 상담으로 시작합니다. 병력, 가족 상황, 희망 지역, 혹은 RCFE 창업 목표까지 세심히 경청합니다."
    },
    "Unpack options & verify compliance": {
      es: "Analizar opciones y verificar cumplimiento",
      zh: "梳理可行方案并核查合规细节",
      tl: "Suriin ang mga opsyon at tiyakin ang pagsunod sa batas",
      vi: "Phân tích lựa chọn & xác minh tuân thủ",
      ko: "옵션 비교 분석 및 규정 준수 확인"
    },
    "We cut through the jargon. We explain the legal differences between RCFE, Hospice Waivers, and Nursing Facilities, verify state licenses, and outline financial costs and schedules.": {
      es: "Eliminamos la jerga técnica. Explicamos las diferencias legales entre RCFE, exenciones de hospicio y enfermería especializada, verificamos licencias estatales y detallamos costos y plazos.",
      zh: "我们为您拨开术语迷雾：讲清 RCFE、临终关怀豁免与护理院的法律区别，核验州政府牌照状态，并清晰列出费用与时间节点。",
      tl: "Pinapadali namin ang mga terminolohiya. Ipinapaliwanag namin ang legal na pagkakaiba ng RCFE, Hospice Waivers, at Nursing Facilities, tsinitsek ang lisensya, at nililinaw ang gastos at iskedyul.",
      vi: "Chúng tôi giải thích dễ hiểu sự khác biệt pháp lý giữa RCFE, Miễn trừ Hospice và Viện Điều dưỡng, kiểm tra giấy phép tiểu bang và vạch rõ chi phí cùng tiến độ.",
      ko: "어려운 전문 용어를 쉽게 풀어드립니다. RCFE, 호스피스 면제, 전문간호시설의 법적 차이를 설명하고 주정부 면허를 검증하며 예상 비용과 일정을 투명하게 정리합니다."
    },
    "Move forward with total confidence": {
      es: "Avance con total confianza",
      zh: "从容迈出决定性一步",
      tl: "Sumulong nang may buong tiwala",
      vi: "Vững tâm bước tiếp",
      ko: "확신과 신뢰를 가지고 다음 단계로"
    },
    "Whether signing an admission agreement or walking into your CDSS licensing inspection, you have tailored documentation and an advocate standing right beside you.": {
      es: "Ya sea firmando un contrato de admisión o entrando a su inspección del CDSS, contará con documentación a la medida y un aliado experto a su lado.",
      zh: "无论是签署入住协议还是迎接 CDSS 现场检查，您都拥有量身定制的完备文件以及全程并肩支持您的专业顾问。",
      tl: "Sa pagpirma man ng kontrata sa pagpasok o pagharap sa inspeksyon ng CDSS, mayroon kayong maayos na dokumento at kakamping tagapayo sa tabi ninyo.",
      vi: "Dù đang ký hợp đồng nhập viện hay bước vào buổi thanh tra CDSS, bạn luôn có hồ sơ chuẩn xác và người đồng hành tận tâm ngay bên cạnh.",
      ko: "입소 계약서에 서명하는 순간이든 CDSS 인허가 현장 실사를 앞둔 순간이든, 맞춤형 서류와 든든한 조력자가 곁에 있습니다."
    },
    "Start a conversation": {
      es: "Iniciar una conversación",
      zh: "开启对话咨询",
      tl: "Magsimula ng usapan",
      vi: "Bắt đầu trò chuyện",
      ko: "상담 시작하기"
    },
    "Help Center & Resources": {
      es: "Centro de Ayuda y Recursos",
      zh: "帮助中心与资源",
      tl: "Sentro ng Tulong at Impormasyon",
      vi: "Trung Tâm Hỗ Trợ & Tài Nguyên",
      ko: "지원 센터 및 자료실"
    },
    "Answers & Compassionate Support": {
      es: "Respuestas y Apoyo Compasivo",
      zh: "专业解答与温暖支持",
      tl: "Mga Sagot at Mapagmalasakit na Suporta",
      vi: "Giải Đáp & Hỗ Trợ Tận Tình",
      ko: "명쾌한 답변과 따뜻한 지원"
    },
    "Find fast answers to commonly asked elder care and RCFE licensing questions, or reach out directly to our team.": {
      es: "Encuentre respuestas rápidas a las dudas más frecuentes sobre cuidado de adultos mayores y licencias RCFE, o comuníquese directamente con nuestro equipo.",
      zh: "快速了解有关长者照护安置与 RCFE 牌照申请的常见问题解答，或直接联系我们的团队。",
      tl: "Makahanap ng mabilisang sagot sa mga karaniwang tanong tungkol sa pag-aalaga ng matatanda at lisensyang RCFE, o direktang makipag-ugnayan sa aming grupo.",
      vi: "Tìm nhanh lời giải đáp cho các câu hỏi thường gặp về chăm sóc người cao tuổi và giấy phép RCFE, hoặc liên hệ trực tiếp với chúng tôi.",
      ko: "어르신 돌봄과 RCFE 인허가에 관한 자주 묻는 질문의 답을 빠르게 확인하거나 저희 팀에 직접 문의하세요."
    },
    "Need Help Choosing a Care Home?": {
      es: "¿Necesita ayuda para elegir un hogar de cuidado?",
      zh: "需要协助挑选长者照护之家？",
      tl: "Kailangan ng Tulong sa Pagpili ng Care Home?",
      vi: "Cần Giúp Đỡ Chọn Nhà Chăm Sóc?",
      ko: "요양홈 선택에 도움이 필요하신가요?"
    },
    "Tell us about your parent's current condition and location. We provide honest recommendations and questions to ask on your tours.": {
      es: "Cuéntenos sobre la condición actual y ubicación de su padre o madre. Ofrecemos recomendaciones honestas y preguntas clave para sus recorridos.",
      zh: "告诉我们父母目前的健康状况与所在区域，我们将提供真诚建议以及参观考察清单。",
      tl: "Ibahagi ang kasalukuyang kalagayan at lokasyon ng inyong magulang. Nagbibigay kami ng tapat na rekomendasyon at mga dapat itanong sa pagbisita.",
      vi: "Hãy cho chúng tôi biết tình trạng sức khỏe và khu vực của cha mẹ bạn. Chúng tôi gợi ý trung thực và cung cấp danh sách câu hỏi khi đi tham quan.",
      ko: "부모님의 현재 건강 상태와 희망 지역을 알려주시면, 솔직한 시설 추천과 투어 시 꼭 확인하실 질문을 안내해 드립니다."
    },
    "Ask a Care Specialist": {
      es: "Preguntar a un especialista",
      zh: "向照护专家咨询",
      tl: "Magtanong sa Care Specialist",
      vi: "Hỏi chuyên viên chăm sóc",
      ko: "케어 전문가에게 물어보기"
    },
    "Starting or Licensing an RCFE?": {
      es: "¿Iniciando o licenciando un RCFE?",
      zh: "正在创办或申请 RCFE 牌照？",
      tl: "Magtatayo o Kukuha ng Lisensyang RCFE?",
      vi: "Đang Khởi Tạo Hoặc Xin Giấy Phép RCFE?",
      ko: "RCFE 개원이나 인허가를 준비 중이신가요?"
    },
    "Whether you need a Plan of Operation or assistance preparing for your LPA walk-through, our compliance team is here for you.": {
      es: "Ya sea que necesite un Plan de Operación o apoyo para prepararse para su recorrido con el LPA, nuestro equipo de cumplimiento está para ayudarle.",
      zh: "无论您需要制定运营计划书还是筹备 LPA 预检，我们的合规顾问团队随时为您提供支持。",
      tl: "Kailangan man ng Plan of Operation o tulong sa paghahanda para sa pagbisita ng LPA, nandito ang aming compliance team para sa inyo.",
      vi: "Dù cần lập Kế hoạch Vận hành hay chuẩn bị đón thanh tra LPA, đội ngũ chuyên trách pháp lý của chúng tôi luôn sẵn sàng hỗ trợ.",
      ko: "운영 계획서(Plan of Operation) 작성이나 LPA 현장 실사 대비가 필요하시다면 저희 규정 준수 전담팀이 도와드립니다."
    },
    "Consult With an RCFE Expert": {
      es: "Consultar con un experto en RCFE",
      zh: "与 RCFE 牌照专家交流",
      tl: "Kumonsulta sa Eksperto sa RCFE",
      vi: "Tư vấn cùng chuyên gia RCFE",
      ko: "RCFE 전문가와 상담하기"
    },
    "Frequently Asked Questions": {
      es: "Preguntas Frecuentes",
      zh: "常见问题解答",
      tl: "Mga Madalas Itanong",
      vi: "Câu Hỏi Thường Gặp",
      ko: "자주 묻는 질문 (FAQ)"
    },
    "What is the difference between an RCFE and a Skilled Nursing Facility (SNF)?": {
      es: "¿Cuál es la diferencia entre un RCFE y un Centro de Enfermería Especializada (SNF)?",
      zh: "RCFE 与专业护理机构（SNF）有什么区别？",
      tl: "Ano ang pagkakaiba ng RCFE at ng Skilled Nursing Facility (SNF)?",
      vi: "Sự khác nhau giữa RCFE và Cơ sở Điều dưỡng Chuyên môn (SNF) là gì?",
      ko: "RCFE와 전문간호요양시설(SNF)은 어떤 차이가 있나요?"
    },
    "Does Medicare or Medi-Cal pay for RCFE residential care?": {
      es: "¿Medicare o Medi-Cal cubren el cuidado residencial en un RCFE?",
      zh: "Medicare 或 Medi-Cal 报销 RCFE 寄宿照护费用吗？",
      tl: "Binabayaran ba ng Medicare o Medi-Cal ang pag-aalaga sa RCFE?",
      vi: "Medicare hay Medi-Cal có chi trả cho dịch vụ chăm sóc tại RCFE không?",
      ko: "메디케어(Medicare)나 메디칼(Medi-Cal)로 RCFE 비용 지원이 가능한가요?"
    },
    "How long does it take to obtain an RCFE license in California?": {
      es: "¿Cuánto tiempo toma obtener una licencia RCFE en California?",
      zh: "在加州取得 RCFE 牌照通常需要多长时间？",
      tl: "Gaano katagal makakuha ng lisensyang RCFE sa California?",
      vi: "Xin giấy phép RCFE tại California mất bao lâu?",
      ko: "캘리포니아에서 RCFE 라이선스를 취득하는 데 얼마나 걸리나요?"
    },
    "Why do many families prefer a 6-bed care home over a 150-room facility?": {
      es: "¿Por qué muchas familias prefieren una casa de 6 camas frente a un centro de 150 habitaciones?",
      zh: "为什么很多家庭更偏爱 6 床位小家而不是 150 间房的大型养老院？",
      tl: "Bakit mas pinipili ng maraming pamilya ang 6-bed care home kaysa sa 150-silid na pasilidad?",
      vi: "Vì sao nhiều gia đình ưu tiên nhà chăm sóc 6 giường hơn cơ sở 150 phòng?",
      ko: "많은 가족들이 150실 대형 시설보다 6인실 소규모 케어 홈을 선호하는 이유는 무엇인가요?"
    },
    "Large facilities can be overwhelming for seniors with dementia, mobility limits, or sensory overload. A standard 6-bed RCFE operates inside a quiet residential neighborhood with 1 caregiver for every 3 residents, family-style meals cooked in a real kitchen, and personalized familiarity where staff notice even subtle daily changes.": {
      es: "Los centros grandes pueden resultar abrumadores para adultos mayores con demencia, movilidad reducida o sobrecarga sensorial. Un RCFE estándar de 6 camas funciona en un vecindario residencial tranquilo, con 1 cuidador por cada 3 residentes, comidas caseras en una cocina real y atención cercana donde el personal nota hasta cambios sutiles diarios.",
      zh: "对于患有失智症、行动不便或容易感官超载的长者而言，大型机构往往显得嘈杂陌生。标准的 6 床位 RCFE 位于安静的居民社区内，护患比约为 1 对 3，每日由真实厨房现做家常饭菜，熟悉贴身的照护人员能敏锐察觉长者每天的细微变化。",
      tl: "Maaaring nakakapagod ang malalaking pasilidad para sa mga nakatatandang may demensya o hirap kumilos. Ang karaniwang 6-bed RCFE ay nasa tahimik na pamayanan na may 1 tagapag-alaga sa bawat 3 residente, lutong-bahay na pagkain, at personal na pagtutok kung saan madaling napapansin ang maliliit na pagbabago sa kalusugan.",
      vi: "Cơ sở lớn dễ khiến người mắc chứng sa sút trí tuệ hoặc hạn chế vận động bị quá tải giác quan. Nhà RCFE 6 giường nằm trong khu dân cư yên tĩnh với tỷ lệ 1 người chăm 3 cụ, bữa ăn nấu tại bếp gia đình và sự gắn bó giúp nhân viên nhận ra ngay những thay đổi nhỏ hàng ngày.",
      ko: "치매나 거동 제한이 있거나 자극에 예민한 어르신께는 대형 시설이 다소 압도적일 수 있습니다. 일반적인 6인실 RCFE는 조용한 주거 단지 내에 위치하며 입소자 3명당 1명의 돌봄 인력이 상주하고, 가정식 주방에서 직접 조리한 식사와 세심한 관찰을 통해 작은 컨디션 변화까지 빠르게 살핍니다."
    },
    "How does Love RCFE make money? (Our Transparent Revenue Model)": {
      es: "¿Cómo genera ingresos Love RCFE? (Nuestro modelo transparente)",
      zh: "Love RCFE 如何收费？（我们的透明盈利模式）",
      tl: "Paano kumikita ang Love RCFE? (Aming Malinaw na Modelo)",
      vi: "Love RCFE thu phí như thế nào? (Mô hình minh bạch)",
      ko: "Love RCFE는 어떻게 운영되나요? (투명한 수익 구조 안내)"
    },
    "We believe in 100% transparency. Love RCFE has two distinct, ethical service tracks with clear revenue models:": {
      es: "Creemos en la transparencia del 100%. Love RCFE maneja dos líneas de servicio éticas y bien diferenciadas:",
      zh: "我们坚持 100% 透明原则。Love RCFE 拥有两条独立且规范的服务线，收费方式清晰明了：",
      tl: "Naniniwala kami sa 100% na kalinawan. May dalawang malinaw at etikal na serbisyo ang Love RCFE:",
      vi: "Chúng tôi cam kết minh bạch 100%. Love RCFE hoạt động với hai mảng dịch vụ rõ ràng và chuẩn mực:",
      ko: "저희는 100% 투명성을 원칙으로 합니다. Love RCFE는 명확히 구분된 두 가지 정직한 서비스 체계를 운영합니다:"
    },
    "For Seniors & Families (100% Free)": {
      es: "Para Adultos Mayores y Familias (100% Gratis)",
      zh: "面向长者与家庭（100% 免费）",
      tl: "Para sa Nakatatanda at Pamilya (100% Libre)",
      vi: "Cho Người Cao Tuổi & Gia Đình (Miễn Phí 100%)",
      ko: "어르신 및 가족 (100% 무료)"
    },
    "For RCFE Operators (Professional Consulting)": {
      es: "Para Operadores de RCFE (Consultoría Profesional)",
      zh: "面向 RCFE 运营商（专业有偿咨询）",
      tl: "Para sa mga Operator ng RCFE (Propesyonal na Pagkonsulta)",
      vi: "Cho Nhà Vận Hành RCFE (Tư Vấn Chuyên Nghiệp)",
      ko: "RCFE 운영자 (전문 유료 컨설팅)"
    },
    "Have a specific or urgent question not listed here?": {
      es: "¿Tiene una pregunta específica o urgente que no aparece aquí?",
      zh: "有未列出的具体或紧急疑问吗？",
      tl: "May tiyak o agarang tanong na wala sa listahan?",
      vi: "Bạn có câu hỏi cụ thể hoặc khẩn cấp chưa có ở đây?",
      ko: "목록에 없는 구체적이거나 긴급한 질문이 있으신가요?"
    },
    "Open the Contact Form": {
      es: "Abrir formulario de contacto",
      zh: "打开联系表单",
      tl: "Buksan ang Form ng Pakikipag-ugnayan",
      vi: "Mở biểu mẫu liên hệ",
      ko: "문의 양식 열기"
    },
    "Start a Conversation": {
      es: "Inicie una Conversación",
      zh: "与我们开启对话",
      tl: "Magsimula ng Usapan",
      vi: "Bắt Đầu Trao Đổi",
      ko: "상담 대화 시작하기"
    },
    "We are here to listen.": {
      es: "Estamos aquí para escucharle.",
      zh: "我们随时倾听您的声音。",
      tl: "Nandito kami upang makinig.",
      vi: "Chúng tôi luôn sẵn sàng lắng nghe.",
      ko: "언제든 귀 기울여 듣겠습니다."
    },
    "Tell us a little about your current situation. Whether you need immediate elder care placement or strategic consulting to license a new RCFE, our team responds promptly within 1 business day.": {
      es: "Cuéntenos brevemente su situación actual. Ya sea ubicación urgente para un familiar o consultoría estratégica para licenciar un nuevo RCFE, nuestro equipo responde en 1 día hábil.",
      zh: "请简要告诉我们您目前的处境。无论您需要紧急寻找长者照护床位，还是新开 RCFE 牌照战略咨询，我们的团队都会在 1 个工作日内迅速回复。",
      tl: "Ibahagi ang inyong kasalukuyang sitwasyon. Agarang paghahanap man ng matitirhan o estratehikong pagkonsulta para sa lisensya ng RCFE, sumasagot kami sa loob ng 1 araw ng trabaho.",
      vi: "Hãy chia sẻ đôi nét về tình hình hiện tại của bạn. Dù là tìm nơi ở khẩn cấp cho người thân hay tư vấn chiến lược mở cơ sở RCFE mới, chúng tôi phản hồi trong vòng 1 ngày làm việc.",
      ko: "현재 상황을 간단히 들려주세요. 긴급 어르신 입소 연계든 신규 RCFE 인허가 전략 컨설팅이든 영업일 기준 1일 이내에 신속히 답변드립니다."
    },
    "Direct Phone": {
      es: "Teléfono Directo",
      zh: "直线电话",
      tl: "Direktang Telepono",
      vi: "Điện Thoại Trực Tiếp",
      ko: "직통 전화"
    },
    "Monday – Saturday: 8:00 AM – 7:00 PM PT": {
      es: "Lunes – Sábado: 8:00 AM – 7:00 PM (Hora del Pacífico)",
      zh: "周一至周六：太平洋时间 8:00 AM – 7:00 PM",
      tl: "Lunes – Sabado: 8:00 AM – 7:00 PM PT",
      vi: "Thứ Hai – Thứ Bảy: 8:00 AM – 7:00 PM (Giờ Thái Bình Dương)",
      ko: "월요일 – 토요일: 오전 8:00 – 오후 7:00 (태평양 표준시)"
    },
    "Email Inquiries": {
      es: "Consultas por Correo",
      zh: "电子邮件咨询",
      tl: "Mga Pagtatanong sa Email",
      vi: "Liên Hệ Qua Email",
      ko: "이메일 문의"
    },
    "General inquiries & licensing packets": {
      es: "Consultas generales y paquetes de licenciamiento",
      zh: "一般咨询与牌照材料咨询",
      tl: "Mga pangkalahatang tanong at licensing packet",
      vi: "Thắc mắc chung & hồ sơ xin cấp phép",
      ko: "일반 상담 및 인허가 서류 문의"
    },
    "Headquarters": {
      es: "Área de Servicio",
      zh: "服务覆盖范围",
      tl: "Sakop na Serbisyo",
      vi: "Khu Vực Phục Vụ",
      ko: "서비스 지역"
    },
    "Serving All of California": {
      es: "Atendemos en todo California",
      zh: "服务遍及全加州",
      tl: "Naglilingkod sa Buong California",
      vi: "Phục Vụ Toàn Bang California",
      ko: "캘리포니아 전 지역 서비스"
    },
    "Bay Area • Los Angeles • Orange County • Sacramento": {
      es: "Área de la Bahía • Los Ángeles • Condado de Orange • Sacramento",
      zh: "旧金山湾区 • 洛杉矶 • 橙县 • 萨克拉门托",
      tl: "Bay Area • Los Angeles • Orange County • Sacramento",
      vi: "Bay Area • Los Angeles • Orange County • Sacramento",
      ko: "베이 지역 • 로스앤젤레스 • 오렌지 카운티 • 새크라멘토"
    },
    "Prefer a scheduled phone call?": {
      es: "¿Prefiere una llamada telefónica programada?",
      zh: "更希望预约时段接听回电？",
      tl: "Mas gusto ba ng nakatakdang tawag sa telepono?",
      vi: "Bạn muốn đặt lịch hẹn gọi điện trước?",
      ko: "원하시는 시간에 전화 상담을 받고 싶으신가요?"
    },
    "Click here to pick a 15-minute slot on our calendar →": {
      es: "Haga clic aquí para elegir un horario de 15 minutos →",
      zh: "点击此处挑选 15 分钟专属通话时段 →",
      tl: "I-click dito upang pumili ng 15-minutong oras sa aming kalendaryo →",
      vi: "Nhấn vào đây để chọn khung giờ 15 phút trên lịch →",
      ko: "여기를 클릭해 15분 상담 시간을 선택하세요 →"
    },
    "Send an Enquiry": {
      es: "Enviar una Consulta",
      zh: "发送在线咨询",
      tl: "Magpadala ng Pagtatanong",
      vi: "Gửi Thư Tư Vấn",
      ko: "온라인 상담 문의"
    },
    "We respond to every message with personal attention. No spam, ever.": {
      es: "Respondemos cada mensaje con atención personalizada. Nunca enviamos spam.",
      zh: "每条留言均由人工贴心跟进回复，绝无垃圾邮件。",
      tl: "Personal naming sinasagot ang bawat mensahe. Walang spam, kailanman.",
      vi: "Chúng tôi trực tiếp phản hồi từng tin nhắn một cách tận tâm. Tuyệt đối không gửi thư rác.",
      ko: "모든 문의에 담당자가 직접 정성껏 답변드리며, 스팸 연락은 절대 하지 않습니다."
    },
    "I am reaching out regarding *": {
      es: "Me comunico en relación con *",
      zh: "我的咨询主题 *",
      tl: "Sumusulat ako tungkol sa *",
      vi: "Tôi liên hệ về vấn đề *",
      ko: "문의 분야 선택 *"
    },
    "Elder Care / Family Placement": {
      es: "Cuidado de Adultos Mayores / Ubicación Familiar",
      zh: "长者照护 / 家庭安置寻找床位",
      tl: "Pag-aalaga sa Matatanda / Paghahanap ng Pamilya",
      vi: "Chăm sóc Người cao tuổi / Tìm nơi ở cho Gia đình",
      ko: "어르신 돌봄 / 가족 입소 연계"
    },
    "RCFE Licensing & Consulting": {
      es: "Licenciamiento RCFE y Consultoría",
      zh: "RCFE 牌照申请与开办咨询",
      tl: "Lisensyang RCFE at Pagkonsulta",
      vi: "Xin Giấy Phép RCFE & Tư Vấn Mở Cơ Sở",
      ko: "RCFE 인허가 및 운영 컨설팅"
    },
    "Your Full Name *": {
      es: "Nombre Completo *",
      zh: "您的姓名 *",
      tl: "Buong Pangalan *",
      vi: "Họ và Tên *",
      ko: "성함 *"
    },
    "Phone Number *": {
      es: "Número de Teléfono *",
      zh: "联系电话 *",
      tl: "Numero ng Telepono *",
      vi: "Số Điện Thoại *",
      ko: "전화번호 *"
    },
    "Email Address *": {
      es: "Correo Electrónico *",
      zh: "电子邮箱 *",
      tl: "Email Address *",
      vi: "Địa Chỉ Email *",
      ko: "이메일 주소 *"
    },
    "Preferred City / Region": {
      es: "Ciudad o Región Preferida",
      zh: "意向城市 / 地区",
      tl: "Nais na Lungsod / Rehiyon",
      vi: "Thành phố / Khu vực mong muốn",
      ko: "희망 도시 또는 지역"
    },
    "How Can We Help You? *": {
      es: "¿Cómo Podemos Ayudarle? *",
      zh: "请描述您的需求 *",
      tl: "Paano Kami Makakatulong? *",
      vi: "Chúng Tôi Có Thể Giúp Gì Cho Bạn? *",
      ko: "어떤 도움이 필요하신가요? *"
    },
    "Max 3000 chars": {
      es: "Máx. 3000 caracteres",
      zh: "最多 3000 字",
      tl: "Hanggang 3000 letra",
      vi: "Tối đa 3000 ký tự",
      ko: "최대 3,000자"
    },
    "Leave this field empty": {
      es: "Dejar este campo vacío",
      zh: "请留空此栏",
      tl: "Iwanang walang laman",
      vi: "Để trống ô này",
      ko: "이 칸은 비워 두세요"
    },
    "Send Your Message": {
      es: "Enviar Mensaje",
      zh: "提交留言",
      tl: "Ipadala ang Mensahe",
      vi: "Gửi Tin Nhắn",
      ko: "메시지 보내기"
    },
    "We respect your privacy. Inquiries are transmitted securely and kept strictly confidential. Please do not include Social Security numbers, financial account details, or medical records.": {
      es: "Respetamos su privacidad. Las consultas se transmiten de forma segura y confidencial. Por favor, no incluya números de Seguro Social, datos bancarios ni historiales médicos.",
      zh: "我们尊重您的隐私。所有咨询均通过加密方式安全传输并严格保密。请勿在表格中填写社会安全号码（SSN）、银行账户或详细医疗病历。",
      tl: "Iginagalang namin ang inyong privacy. Ligtas at kumpidensyal ang pagpapadala ng mga mensahe. Mangyaring huwag maglagay ng Social Security number, detalye ng bangko, o medikal na rekord.",
      vi: "Chúng tôi tôn trọng quyền riêng tư của bạn. Mọi thông tin được truyền tải an toàn và bảo mật nghiêm ngặt. Vui lòng không nhập số An sinh Xã hội, tài khoản ngân hàng hoặc hồ sơ bệnh án.",
      ko: "귀하의 개인정보를 소중히 보호합니다. 모든 문의 내용은 안전하게 암호화되어 기밀로 처리됩니다. 사회보장번호(SSN), 금융 계좌 정보, 상세 의료 기록은 입력하지 말아 주세요."
    },
    "Website Information": {
      es: "Información del Sitio Web",
      zh: "网站说明信息",
      tl: "Impormasyon ng Website",
      vi: "Thông Tin Trang Web",
      ko: "웹사이트 이용 안내"
    },
    "Terms of Use": {
      es: "Términos de Uso",
      zh: "使用条款",
      tl: "Mga Tuntunin sa Paggamit",
      vi: "Điều Khoản Sử Dụng",
      ko: "이용약관"
    },
    "1. Using This Website": {
      es: "1. Uso de este sitio web",
      zh: "1. 本网站的使用",
      tl: "1. Paggamit ng Website na Ito",
      vi: "1. Sử dụng trang web này",
      ko: "1. 웹사이트 이용"
    },
    "This website shares general information about Love RCFE’s advisory and consulting services. You may use it to learn about our services, utilize interactive planning calculators, and submit enquiries. Please provide accurate contact information and do not use the form to transmit unlawful, abusive, or copyrighted materials.": {
      es: "Este sitio web comparte información general sobre los servicios de asesoría y consultoría de Love RCFE. Puede utilizarlo para conocer nuestros servicios, usar las calculadoras interactivas y enviar consultas. Por favor proporcione datos reales y no envíe contenido ilícito, abusivo ni protegido por derechos de autor.",
      zh: "本网站展示 Love RCFE 照护指导与咨询服务的常规信息。您可浏览服务介绍、使用互动预算规划工具及提交咨询留言。请提供真实准确的联系方式，切勿利用表单传输违法、滥用或侵犯版权的内容。",
      tl: "Nagbabahagi ang website na ito ng pangkalahatang impormasyon tungkol sa mga serbisyo ng Love RCFE. Maaari ninyo itong gamitin upang matuto, gumamit ng kalkulador, at magtanong. Magbigay ng tamang impormasyon at huwag magpadala ng labag sa batas o nakakasakit na nilalaman.",
      vi: "Trang web này cung cấp thông tin chung về dịch vụ tư vấn của Love RCFE. Bạn có thể tìm hiểu dịch vụ, sử dụng bảng tính chi phí và gửi yêu cầu tư vấn. Vui lòng cung cấp thông tin chính xác và không gửi nội dung vi phạm pháp luật hoặc bản quyền.",
      ko: "본 웹사이트는 Love RCFE의 상담 및 컨설팅 서비스에 관한 일반 정보를 제공합니다. 서비스 안내 확인, 비용 계산기 사용, 온라인 문의 접수 용도로 이용하실 수 있으며, 정확한 연락처를 기재하시고 불법적이거나 저작권을 침해하는 내용을 전송하지 마시기 바랍니다."
    },
    "2. Advisory Guidance, Not Medical or Legal Guarantee": {
      es: "2. Orientación informativa, no garantía médica ni legal",
      zh: "2. 咨询指导性质与非医疗/法律保证声明",
      tl: "2. Gabay Lamang, Hindi Medikal o Legal na Garantiya",
      vi: "2. Tư vấn định hướng, không phải bảo đảm y tế hay pháp lý",
      ko: "2. 자문 안내이며 의학적·법률적 보증이 아님"
    },
    "Information on this website is for general educational and placement assistance purposes only. It does not replace formal counsel from licensed attorneys, medical physicians, or state licensing regulators. Submitting an enquiry does not establish an attorney-client or fiduciary consulting relationship, nor does it guarantee specific placement availability or state license approval from the California Department of Social Services (CDSS).": {
      es: "La información de este sitio tiene fines exclusivamente educativos y de orientación. No sustituye el criterio formal de abogados con licencia, médicos ni autoridades reguladoras estatales. Enviar una consulta no crea relación abogado-cliente ni fiduciaria, ni garantiza disponibilidad específica de plazas o aprobación de licencia ante el CDSS.",
      zh: "本网站内容仅供一般教育与照护安置参考，不能替代执业律师、医生或州监管机构的专业意见。提交咨询表格并不构成律师-客户关系或受托顾问关系，亦不保证特定床位名额或加州社会服务部（CDSS）的牌照必然获批。",
      tl: "Ang impormasyon sa site na ito ay para sa pangkalahatang gabay lamang at hindi pumapalit sa payo ng lisensyadong abogado, doktor, o regulator ng estado. Ang pagpapadala ng mensahe ay hindi bumubuo ng opisyal na relasyong legal o garantiya ng pagkakapasa ng lisensya sa CDSS.",
      vi: "Thông tin trên trang chỉ nhằm mục đích tham khảo giáo dục và hỗ trợ tìm nơi ở, không thay thế tư vấn chính thức từ luật sư, bác sĩ hay cơ quan cấp phép. Việc gửi biểu mẫu không xác lập quan hệ luật sư-thân chủ hoặc bảo đảm phê duyệt giấy phép từ CDSS.",
      ko: "본 웹사이트의 정보는 일반적인 교육 및 입소 지원 안내 목적이며, 면허 변호사, 의사 또는 주정부 인허가 기관의 공식 판단을 대신하지 않습니다. 문의 접수로 변호사-의뢰인 관계가 성립되거나 특정 입소 자리 및 CDSS 라이선스 승인이 보장되지는 않습니다."
    },
    "3. Interactive Tools and Estimations": {
      es: "3. Herramientas interactivas y estimaciones",
      zh: "3. 互动工具与费用估算",
      tl: "3. Mga Interaktibong Tool at Pagtatantya",
      vi: "3. Công cụ tương tác & ước tính chi phí",
      ko: "3. 인터랙티브 도구 및 추정치"
    },
    "Cost calculators and level-of-care assessment tools are provided for ballpark estimation only. Actual monthly facility charges are determined exclusively by the individual residential care home following their formal Physician's Assessment (LIC 602A) and pre-admission appraisal.": {
      es: "Las calculadoras de costos y herramientas de autoevaluación ofrecen solo estimaciones aproximadas. Las tarifas mensuales reales son determinadas únicamente por cada centro residencial tras su Evaluación Médica formal (LIC 602A) y valoración previa al ingreso.",
      zh: "费用计算器及照护等级自评工具仅供大致预算参考。实际月费由各个养老之家在完成正式医生健康评估表（LIC 602A）及入院前评估后单独核定。",
      tl: "Ang mga kalkulador ng gastos at pagsusuri ay gabay na tantya lamang. Ang aktwal na buwanang singil ay itinatakda lamang ng bawat care home matapos ang pormal na Physician's Assessment (LIC 602A).",
      vi: "Bảng tính chi phí và công cụ đánh giá chỉ cung cấp mức ước tính sơ bộ. Mức phí thực tế hàng tháng do từng cơ sở quy định sau khi có Giấy khám Bác sĩ chính thức (LIC 602A) và đánh giá trước nhập viện.",
      ko: "비용 계산기와 자가진단 도구는 대략적인 추산치만을 제공합니다. 실제 월 이용 요금은 각 주거형 요양홈이 공식 의사 평가서(LIC 602A)와 입소 전 평가를 마친 후 최종 결정합니다."
    },
    "4. Changes & Contact": {
      es: "4. Cambios y Contacto",
      zh: "4. 条款更新与联系方式",
      tl: "4. Mga Pagbabago at Pakikipag-ugnayan",
      vi: "4. Thay đổi & Liên hệ",
      ko: "4. 약관 변경 및 문의"
    },
    "These terms may be updated periodically to reflect changes in regulatory standards or service offerings. For questions, please reach out via our contact page.": {
      es: "Estos términos pueden actualizarse periódicamente para reflejar cambios regulatorios o de servicios. Si tiene dudas, contáctenos mediante nuestra página de contacto.",
      zh: "本条款可能不定期更新以反映最新法规或服务内容。如有任何疑问，请通过我们的联系页面与我们取得联系。",
      tl: "Maaaring i-update ang mga tuntuning ito paminsan-minsan upang umayon sa mga bagong regulasyon o serbisyo. Para sa mga katanungan, makipag-ugnayan sa aming contact page.",
      vi: "Các điều khoản này có thể được cập nhật định kỳ theo thay đổi quy định hoặc dịch vụ. Nếu có thắc mắc, vui lòng liên hệ qua trang Liên hệ của chúng tôi.",
      ko: "본 약관은 법규 기준이나 제공 서비스 변경에 따라 주기적으로 업데이트될 수 있습니다. 문의 사항은 문의하기 페이지를 이용해 주세요."
    },
    "Have a question? Contact us": {
      es: "¿Tiene preguntas? Contáctenos",
      zh: "有疑问？联系我们",
      tl: "May tanong? Makipag-ugnayan",
      vi: "Bạn có câu hỏi? Liên hệ ngay",
      ko: "궁금한 점이 있으신가요? 문의하기"
    },
    "Your Information": {
      es: "Su Información",
      zh: "您的信息保护",
      tl: "Ang Inyong Impormasyon",
      vi: "Thông Tin Của Bạn",
      ko: "개인정보 안내"
    },
    "Privacy Policy": {
      es: "Política de Privacidad",
      zh: "隐私政策",
      tl: "Patakaran sa Privacy",
      vi: "Chính Sách Bảo Mật",
      ko: "개인정보 처리방침"
    },
    "1. Information We Collect": {
      es: "1. Información que recopilamos",
      zh: "1. 我们收集的信息",
      tl: "1. Impormasyong Kinokolekta Namin",
      vi: "1. Thông tin chúng tôi thu thập",
      ko: "1. 수집하는 정보"
    },
    "When you submit an enquiry through our contact forms or assessment tools, we collect the details you voluntarily submit: your name, email address, phone number, geographic region, inquiry category, message details, and submission timestamp. We do not sell your personal contact information to third-party marketing brokers.": {
      es: "Cuando envía una consulta mediante nuestros formularios o herramientas, recopilamos los datos que proporciona voluntariamente: nombre, correo, teléfono, región, tipo de consulta, mensaje y hora de envío. Nunca vendemos su información personal a corredores de datos ni terceros.",
      zh: "当您通过联系表单或自评工具提交咨询时，我们会收集您自愿填写的信息：姓名、电子邮箱、电话号码、所在区域、咨询类别、留言详情及提交时间。我们绝不向任何第三方营销机构出售您的个人联系信息。",
      tl: "Kapag nagsumite kayo ng mensahe sa aming form o assessment tool, kinokolekta namin ang kusang-loob ninyong ibinigay: pangalan, email, telepono, rehiyon, paksa, mensahe, at oras ng pagsusumite. Hindi namin ibinebenta ang inyong impormasyon kaninuman.",
      vi: "Khi bạn gửi yêu cầu qua biểu mẫu liên hệ hoặc công cụ đánh giá, chúng tôi thu thập thông tin bạn tự nguyện cung cấp: tên, email, số điện thoại, khu vực, chủ đề, nội dung tin nhắn và thời gian gửi. Chúng tôi tuyệt đối không bán dữ liệu cá nhân cho bên thứ ba.",
      ko: "문의 양식이나 자가진단 도구를 제출하실 때, 성함, 이메일, 전화번호, 희망 지역, 문의 유형, 메시지 내용, 접수 시각 등 자발적으로 입력하신 정보를 수집합니다. 수집된 연락처 정보는 제3자 마케팅 업체에 절대 판매하지 않습니다."
    },
    "2. How Your Information is Used": {
      es: "2. Cómo usamos su información",
      zh: "2. 我们如何使用您的信息",
      tl: "2. Paano Ginagamit ang Inyong Impormasyon",
      vi: "2. Cách chúng tôi sử dụng thông tin",
      ko: "2. 정보의 이용 목적"
    },
    "The information you provide is utilized exclusively by our advisory team to respond to your request, assess appropriate senior living placement options, or provide consulting proposals for RCFE licensing. We may coordinate directly with licensed care homes you specifically authorize us to contact on your behalf.": {
      es: "Nuestro equipo asesor utiliza su información exclusivamente para responder a su solicitud, evaluar opciones de cuidado residencial o preparar propuestas de licenciamiento RCFE. Solo coordinamos con centros con licencia cuando usted nos autorice expresamente.",
      zh: "您提供的信息仅由我们的顾问团队专门用于回复您的咨询、评估合适的长者居住安置方案，或提供 RCFE 牌照咨询建议。仅在您明确授权的情况下，我们才会与相关持牌照护之家直接沟通协调。",
      tl: "Ang ibinigay ninyong impormasyon ay ginagamit lamang ng aming grupo upang sagutin ang inyong hiling, suriin ang mga opsyon sa pag-aalaga, o magbigay ng panukala sa lisensyang RCFE kapag pinahintulutan ninyo.",
      vi: "Thông tin của bạn chỉ được đội ngũ tư vấn sử dụng để phản hồi yêu cầu, đánh giá lựa chọn nhà chăm sóc phù hợp hoặc báo giá tư vấn cấp phép RCFE, và chỉ liên hệ với cơ sở được phép khi có sự đồng ý của bạn.",
      ko: "제공하신 정보는 상담 답변, 적합한 어르신 거주 시설 평가 또는 RCFE 인허가 컨설팅 제안에 한해 전담 상담팀만 사용합니다. 귀하가 명시적으로 동의하신 경우에만 인가된 요양홈과 직접 조율합니다."
    },
    "3. Medical Information Notice": {
      es: "3. Aviso sobre información médica",
      zh: "3. 医疗隐私提示",
      tl: "3. Paunawa Tungkol sa Impormasyong Medikal",
      vi: "3. Lưu ý về thông tin y tế",
      ko: "3. 의료 정보 입력 유의사항"
    },
    "Please do not submit full Social Security numbers, detailed medical histories, or protected health information (PHI) via open public web forms. Sensitive medical appraisals (such as California Form LIC 602A) are shared only through secure, HIPAA-compliant channels during formal admission reviews.": {
      es: "Por favor no envíe números completos de Seguro Social, historiales clínicos detallados ni información médica protegida (PHI) en formularios web abiertos. Las evaluaciones sensibles (como el Formulario LIC 602A) solo se comparten por canales seguros compatibles con HIPAA.",
      zh: "请勿通过公开网页表单提交完整的社会安全号码（SSN）、详细病历或受保护健康信息（PHI）。诸如加州 LIC 602A 等敏感医疗评估文件仅在正式入院审查期间通过符合 HIPAA 安全标准的加密渠道传输。",
      tl: "Huwag magsumite ng Social Security number, detalyadong kasaysayang medikal, o protektadong impormasyong pangkalusugan (PHI) sa bukas na web form. Ang mga sensitibong ulat tulad ng LIC 602A ay ibinabahagi lamang sa ligtas at HIPAA-compliant na paraan.",
      vi: "Vui lòng không gửi số An sinh Xã hội đầy đủ, bệnh sử chi tiết hoặc thông tin y tế được bảo vệ (PHI) qua biểu mẫu web công khai. Các hồ sơ y tế nhạy cảm như Mẫu LIC 602A chỉ chia sẻ qua kênh bảo mật chuẩn HIPAA khi làm thủ tục nhập viện.",
      ko: "공개 웹 양식을 통해 사회보장번호 전체, 상세 병력 또는 보호 대상 건강 정보(PHI)를 전송하지 마세요. LIC 602A 같은 민감한 의료 평가 서류는 정식 입소 심사 중 HIPAA 보안 채널을 통해서만 전달됩니다."
    },
    "4. Data Access & Removal Requests": {
      es: "4. Acceso y eliminación de datos",
      zh: "4. 数据查阅与删除请求",
      tl: "4. Pag-access at Pagtanggal ng Datos",
      vi: "4. Quyền truy cập & yêu cầu xóa dữ liệu",
      ko: "4. 정보 열람 및 삭제 요청"
    },
    "5. Services We Use": {
      es: "5. Servicios que utilizamos",
      zh: "5. 本站依赖的第三方技术服务",
      tl: "5. Mga Serbisyong Ginagamit Namin",
      vi: "5. Các dịch vụ chúng tôi sử dụng",
      ko: "5. 이용 중인 외부 기술 서비스"
    },
    "To run this site we rely on a few third-party services: Cloudflare (website hosting, database storage, spam protection, and privacy-friendly traffic statistics), Formspree (to email us the messages you submit), and Google Fonts (to display the site's typefaces). Information you submit through our forms may pass through these services so that we can receive and respond to it.": {
      es: "Para operar este sitio utilizamos algunos servicios esenciales: Cloudflare (alojamiento, base de datos, protección contra spam y estadísticas respetuosas de la privacidad), Formspree (para enviarnos por correo sus consultas) y Google Fonts (tipografías). La información enviada en los formularios pasa por estos servicios para poder recibirla y responderle.",
      zh: "为保障本网站稳定运行，我们依赖以下第三方技术服务：Cloudflare（网站托管、数据库存储、垃圾信息防护及隐私友好的访问统计）、Formspree（用于将您提交的留言转发至我们的顾问邮箱）以及 Google Fonts（网页字体渲染）。您通过表单提交的内容可能会经过上述服务以便我们接收与回复。",
      tl: "Upang patakbuhin ang site na ito, gumagamit kami ng Cloudflare (hosting, database, proteksyon sa spam, at pribadong estadistika), Formspree (upang maipadala sa aming email ang inyong mensahe), at Google Fonts (para sa mga font ng site).",
      vi: "Để vận hành trang web, chúng tôi sử dụng: Cloudflare (lưu trữ web, cơ sở dữ liệu, chống thư rác và thống kê bảo mật), Formspree (chuyển tin nhắn bạn gửi về email của chúng tôi) và Google Fonts (hiển thị phông chữ). Thông tin bạn gửi có thể đi qua các dịch vụ này để chúng tôi tiếp nhận và phản hồi.",
      ko: "본 웹사이트 운영을 위해 Cloudflare(웹 호스팅, 데이터베이스 저장, 스팸 차단, 개인정보 친화적 방문 통계), Formspree(접수된 문의를 이메일로 전달), Google Fonts(글꼴 표시) 서비스를 이용합니다. 양식으로 제출하신 정보는 상담 접수 및 답변 처리를 위해 해당 서비스를 거칠 수 있습니다."
    },
    "Contact our Privacy Officer": {
      es: "Contactar al Oficial de Privacidad",
      zh: "联系隐私保护专员",
      tl: "Makipag-ugnayan sa Privacy Officer",
      vi: "Liên hệ Bộ phận Bảo mật",
      ko: "개인정보 보호 담당자 문의"
    },
    "Call Love RCFE": {
      es: "Llamar a Love RCFE",
      zh: "致电 Love RCFE",
      tl: "Tumawag sa Love RCFE",
      vi: "Gọi cho Love RCFE",
      ko: "Love RCFE 전화 연결"
    },
    "Talk with an advisor. Free and confidential.": {
      es: "Hable con un asesor. Gratis y confidencial.",
      zh: "与顾问通话 · 免费且严格保密。",
      tl: "Makipag-usap sa tagapayo. Libre at kumpidensyal.",
      vi: "Trao đổi với chuyên viên. Miễn phí và bảo mật.",
      ko: "전문 상담사와 통화하세요. 무료이며 비밀이 보장됩니다."
    },
    "Direct Elder Care & Licensing Line": {
      es: "Línea Directa de Cuidado y Licenciamiento",
      zh: "长者照护与牌照咨询专线",
      tl: "Direktang Linya sa Pag-aalaga at Paglilisensya",
      vi: "Đường Dây Trực Tiếp Chăm Sóc & Cấp Phép",
      ko: "어르신 돌봄 및 인허가 직통 번호"
    },
    "Copy number": {
      es: "Copiar número",
      zh: "复制号码",
      tl: "Kopyahin ang numero",
      vi: "Sao chép số",
      ko: "번호 복사"
    },
    "Copied": {
      es: "Copiado",
      zh: "已复制",
      tl: "Nakopya",
      vi: "Đã sao chép",
      ko: "복사됨"
    },
    "Press Ctrl+C to copy": {
      es: "Presione Ctrl+C para copiar",
      zh: "请按 Ctrl+C 复制",
      tl: "Pindutin ang Ctrl+C para kopyahin",
      vi: "Nhấn Ctrl+C để chép",
      ko: "Ctrl+C를 눌러 복사하세요"
    },
    "Open in calling app": {
      es: "Abrir en aplicación de llamadas",
      zh: "用通话应用拨打",
      tl: "Buksan sa calling app",
      vi: "Mở bằng ứng dụng gọi điện",
      ko: "전화 앱으로 바로 걸기"
    },
    "Prefer not to call right now?": {
      es: "¿Prefiere no llamar en este momento?",
      zh: "现在不方便通话？",
      tl: "Ayaw munang tumawag ngayon?",
      vi: "Chưa tiện gọi ngay bây giờ?",
      ko: "지금 바로 전화 통화가 어려우신가요?"
    },
    "Request a callback": {
      es: "Solicitar devolución de llamada",
      zh: "预约回电",
      tl: "Humiling ng callback",
      vi: "Yêu cầu gọi lại",
      ko: "전화 예약 요청"
    },
    "Send an email": {
      es: "Enviar correo electrónico",
      zh: "发送邮件",
      tl: "Magpadala ng email",
      vi: "Gửi email",
      ko: "이메일 보내기"
    },
    "Schedule a 15-Minute Advisory Call": {
      es: "Programar Llamada de Asesoría de 15 Minutos",
      zh: "预约 15 分钟专业电话咨询",
      tl: "Mag-iskedyul ng 15-Minutong Tawag sa Pagkonsulta",
      vi: "Đặt Lịch Gọi Tư Vấn 15 Phút",
      ko: "15분 무료 전화 상담 예약"
    },
    "Complimentary, confidential phone consultation.": {
      es: "Consulta telefónica gratuita y confidencial.",
      zh: "免费且严格保密的电话沟通服务。",
      tl: "Libre at kumpidensyal na konsultasyon sa telepono.",
      vi: "Tư vấn qua điện thoại hoàn toàn miễn phí và bảo mật.",
      ko: "부담 없는 무료·비공개 전화 상담입니다."
    },
    "Your Name *": {
      es: "Su Nombre *",
      zh: "您的姓名 *",
      tl: "Inyong Pangalan *",
      vi: "Tên Của Bạn *",
      ko: "성함 *"
    },
    "Preferred Date *": {
      es: "Fecha Preferida *",
      zh: "期望日期 *",
      tl: "Nais na Petsa *",
      vi: "Ngày Mong Muốn *",
      ko: "희망 날짜 *"
    },
    "Time of Day *": {
      es: "Horario del Día *",
      zh: "方便接听时段 *",
      tl: "Oras ng Araw *",
      vi: "Khung Giờ Trong Ngày *",
      ko: "희망 시간대 *"
    },
    "Morning (9am - 12pm)": {
      es: "Mañana (9am - 12pm)",
      zh: "上午 (9:00 AM - 12:00 PM)",
      tl: "Umaga (9am - 12pm)",
      vi: "Buổi sáng (9am - 12pm)",
      ko: "오전 (오전 9시 - 오후 12시)"
    },
    "Afternoon (1pm - 4pm)": {
      es: "Tarde (1pm - 4pm)",
      zh: "下午 (1:00 PM - 4:00 PM)",
      tl: "Hapon (1pm - 4pm)",
      vi: "Buổi chiều (1pm - 4pm)",
      ko: "오후 (오후 1시 - 4시)"
    },
    "Late Afternoon (4pm - 6pm)": {
      es: "Última hora de la tarde (4pm - 6pm)",
      zh: "傍晚 (4:00 PM - 6:00 PM)",
      tl: "Huling Hapon (4pm - 6pm)",
      vi: "Cuối chiều (4pm - 6pm)",
      ko: "늦은 오후 (오후 4시 - 6시)"
    },
    "We make calls Monday through Saturday. Times are Pacific.": {
      es: "Realizamos llamadas de lunes a sábado. Horario del Pacífico (PT).",
      zh: "我们于周一至周六致电回访，均为美国太平洋时间（PT）。",
      tl: "Tumatawag kami Lunes hanggang Sabado. Ang oras ay Pacific Time.",
      vi: "Chúng tôi gọi từ Thứ Hai đến Thứ Bảy theo giờ Thái Bình Dương (PT).",
      ko: "전화 상담은 월요일부터 토요일까지(태평양 표준시 기준) 진행됩니다."
    },
    "Main Topic of Discussion": {
      es: "Tema Principal de la Consulta",
      zh: "主要咨询主题",
      tl: "Pangunahing Paksa ng Pag-uusap",
      vi: "Chủ Đề Trao Đổi Chính",
      ko: "주요 상담 주제"
    },
    "Elder Care Placement for a Loved One": {
      es: "Ubicación en Cuidado para un Ser Querido",
      zh: "为亲人寻找合适长者照护机构",
      tl: "Paghahanap ng Care Home para sa Mahal sa Buhay",
      vi: "Tìm Nơi Chăm Sóc Cho Người Thân",
      ko: "어르신 요양홈 입소 연계 상담"
    },
    "Opening an RCFE / Title 22 Consulting": {
      es: "Abrir un RCFE / Consultoría Título 22",
      zh: "开设 RCFE / Title 22 牌照咨询",
      tl: "Pagbubukas ng RCFE / Pagkonsulta sa Title 22",
      vi: "Mở Cơ Sở RCFE / Tư Vấn Title 22",
      ko: "RCFE 개원 / Title 22 인허가 컨설팅"
    },
    "VA Aid & Attendance / Medi-Cal ALW Questions": {
      es: "Preguntas sobre VA Aid & Attendance / Medi-Cal ALW",
      zh: "VA Aid & Attendance 补助 / Medi-Cal ALW 咨询",
      tl: "Mga Tanong sa VA Aid & Attendance / Medi-Cal ALW",
      vi: "Thắc mắc về VA Aid & Attendance / Medi-Cal ALW",
      ko: "VA 보훈 연금 / Medi-Cal ALW 지원 문의"
    },
    "Request My Call": {
      es: "Solicitar mi Llamada",
      zh: "提交回电预约",
      tl: "Hilingin ang Aking Tawag",
      vi: "Gửi Yêu Cầu Gọi Lại",
      ko: "전화 상담 신청하기"
    },
    "We respect your privacy and use your details only to arrange your call. Please do not share Social Security numbers, financial details, or medical records.": {
      es: "Respetamos su privacidad y usamos sus datos solo para coordinar su llamada. No comparta Seguro Social, datos bancarios ni historiales médicos.",
      zh: "我们重视您的隐私，您的资料仅用于安排回电沟通。请勿填写社会安全号、财务账户或医疗病历。",
      tl: "Iginagalang namin ang inyong privacy at ginagamit lang ito para ayusin ang tawag. Huwag magbahagi ng Social Security number, detalye ng pera, o medikal na rekord.",
      vi: "Chúng tôi tôn trọng quyền riêng tư và chỉ dùng thông tin để xếp lịch gọi. Vui lòng không cung cấp số SSN, thông tin tài chính hay bệnh án.",
      ko: "입력하신 정보는 상담 예약 일정 조율에만 사용됩니다. 사회보장번호(SSN), 금융 정보, 의료 기록은 입력하지 말아 주세요."
    },
    "Fast Placement Assessment": {
      es: "Evaluación Rápida de Cuidado",
      zh: "快速照护评估",
      tl: "Mabilisang Pagsusuri",
      vi: "Đánh Giá Nhanh Nhu Cầu",
      ko: "빠른 입소 적합성 진단"
    },
    "Care Assessment Wizard": {
      es: "Asistente de Evaluación de Cuidado",
      zh: "智能照护评估向导",
      tl: "Gabay sa Pagsusuri ng Pag-aalaga",
      vi: "Trợ Lý Đánh Giá Chăm Sóc",
      ko: "맞춤 돌봄 평가 마법사"
    },
    "Get an instant recommendation tailored to your loved one's specific needs.": {
      es: "Obtenga una recomendación inmediata adaptada a las necesidades específicas de su ser querido.",
      zh: "立即获取贴合您亲人具体健康与生活需求的专业建议。",
      tl: "Kumuha ng agarang rekomendasyon na akma sa pangangailangan ng inyong mahal sa buhay.",
      vi: "Nhận ngay đề xuất phù hợp nhất với nhu cầu cụ thể của người thân bạn.",
      ko: "어르신의 구체적인 상태에 맞춘 즉각적인 돌봄 추천을 받아보세요."
    },
    "Thoughtful, objective guidance rooted in deep care. Dedicated to connecting families with compassionate elder care and empowering operators to build licensed, compliant California care facilities.": {
      es: "Orientación reflexiva y objetiva basada en un cuidado profundo. Dedicados a conectar familias con cuidado compasivo y apoyar a operadores a construir centros con licencia en California.",
      zh: "源自真诚关爱的客观审慎指引。致力于为家庭链接温暖可靠的养老照护，同时助力运营商打造合规持牌的加州照护社区。",
      tl: "Maingat at patas na gabay na nakaugat sa tunay na malasakit. Nakatuon sa pagkonekta ng mga pamilya sa mapagmahal na pag-aalaga at pagtulong sa mga operator na makapagpatayo ng lisensyadong pasilidad sa California.",
      vi: "Tư vấn chu đáo, khách quan xuất phát từ tấm lòng tận tâm. Kết nối các gia đình với dịch vụ chăm sóc nhân ái và hỗ trợ nhà vận hành xây dựng cơ sở đạt chuẩn cấp phép tại California.",
      ko: "깊은 배려에 바탕을 둔 사려 깊고 객관적인 안내. 가족과 따뜻한 어르신 돌봄을 잇고, 운영자들이 적법하고 신뢰받는 캘리포니아 요양 시설을 세우도록 함께합니다."
    },
    "California Title 22 Specialists": {
      es: "Especialistas en Título 22 de California",
      zh: "加州 Title 22 法规专家",
      tl: "Mga Espesyalista sa California Title 22",
      vi: "Chuyên Gia Title 22 California",
      ko: "캘리포니아 Title 22 전문 컨설팅"
    },
    "Navigation": {
      es: "Navegación",
      zh: "网站导航",
      tl: "Nabigasyon",
      vi: "Điều Hướng",
      ko: "바로가기"
    },
    "Cost Calculator & Assessment": {
      es: "Calculadora y Evaluación",
      zh: "费用计算器与自评",
      tl: "Kalkulador ng Gastos at Pagsusuri",
      vi: "Bảng Tính & Đánh Giá",
      ko: "비용 계산기 및 자가진단"
    },
    "Direct Assistance": {
      es: "Asistencia Directa",
      zh: "直接联系支持",
      tl: "Direktang Tulong",
      vi: "Hỗ Trợ Trực Tiếp",
      ko: "직통 상담 안내"
    },
    "Mon–Sat 8:00 AM – 7:00 PM PT": {
      es: "Lun–Sáb 8:00 AM – 7:00 PM PT",
      zh: "周一至周六 8:00 AM – 7:00 PM PT",
      tl: "Lun–Sab 8:00 AM – 7:00 PM PT",
      vi: "Thứ 2–Thứ 7: 8:00 AM – 7:00 PM PT",
      ko: "월–토 오전 8:00 – 오후 7:00 PT"
    },
    "Love RCFE. All rights reserved. Private, thoughtful elder care guidance.": {
      es: "Love RCFE. Todos los derechos reservados. Asesoría privada y cuidadosa para adultos mayores.",
      zh: "Love RCFE 保留所有权利。私密、用心的长者照护指导。",
      tl: "Love RCFE. Nakalaan ang lahat ng karapatan. Pribado at maingat na gabay sa pag-aalaga.",
      vi: "Love RCFE. Bảo lưu mọi quyền. Tư vấn chăm sóc người cao tuổi riêng tư và tận tâm.",
      ko: "Love RCFE. All rights reserved. 프라이버시를 존중하는 사려 깊은 어르신 돌봄 안내."
    },
    "Support": {
      es: "Soporte",
      zh: "支持中心",
      tl: "Suporta",
      vi: "Hỗ trợ",
      ko: "고객지원"
    },
    "Call us": {
      es: "Llámenos",
      zh: "致电我们",
      tl: "Tawagan kami",
      vi: "Gọi ngay",
      ko: "전화 걸기"
    },

    // 404.html specific phrases
    "404 • Page Not Found": {
      es: "404 • Página No Encontrada",
      zh: "404 • 页面未找到",
      tl: "404 • Hindi Nakita ang Pahina",
      vi: "404 • Không Tìm Thấy Trang",
      ko: "404 • 페이지를 찾을 수 없습니다"
    },
    "We couldn’t find that page.": {
      es: "No pudimos encontrar esa página.",
      zh: "抱歉，我们找不到该页面。",
      tl: "Hindi namin mahanap ang pahinang iyon.",
      vi: "Chúng tôi không tìm thấy trang này.",
      ko: "요청하신 페이지를 찾을 수 없습니다."
    },
    "The link may have moved or been mistyped, but we’re right here to help you find elder care placement or California RCFE licensing guidance.": {
      es: "El enlace pudo haberse movido o escrito mal, pero estamos aquí para ayudarle a encontrar cuidado para adultos mayores u orientación de licencias RCFE en California.",
      zh: "链接可能已迁移或拼写有误，但我们随时在此为您提供加州长者照护安置或 RCFE 牌照咨询协助。",
      tl: "Maaaring nailipat o nagkamali sa pag-type ng link, ngunit nandito kami upang tumulong sa paghahanap ng care home o gabay sa lisensyang RCFE sa California.",
      vi: "Liên kết có thể đã chuyển hoặc nhập nhầm, nhưng chúng tôi luôn ở đây để hỗ trợ tìm nơi chăm sóc người cao tuổi hoặc tư vấn giấy phép RCFE tại California.",
      ko: "링크가 이동되었거나 잘못 입력되었을 수 있지만, 어르신 요양홈 연계와 캘리포니아 RCFE 인허가 안내는 언제든 도와드릴 수 있습니다."
    },
    "Back to Home": {
      es: "Volver al Inicio",
      zh: "返回首页",
      tl: "Bumalik sa Tahanan",
      vi: "Về Trang Chủ",
      ko: "홈으로 돌아가기"
    },
    "Talk with an Advisor": {
      es: "Hablar con un Asesor",
      zh: "咨询专业顾问",
      tl: "Makipag-usap sa Tagapayo",
      vi: "Trao Đổi Với Chuyên Viên",
      ko: "전문 상담사 연결"
    },
    "Popular Destinations": {
      es: "Secciones Populares",
      zh: "热门页面导航",
      tl: "Mga Sikat na Seksyon",
      vi: "Trang Truy Cập Phổ Biến",
      ko: "주요 메뉴 바로가기"
    },
    "Services & Consulting": {
      es: "Servicios y Consultoría",
      zh: "服务项目与专业咨询",
      tl: "Mga Serbisyo at Pagkonsulta",
      vi: "Dịch Vụ & Tư Vấn",
      ko: "서비스 및 컨설팅"
    },
    "Care Cost Calculator": {
      es: "Calculadora de Costos",
      zh: "照护费用计算器",
      tl: "Kalkulador ng Gastos sa Pag-aalaga",
      vi: "Bảng Tính Chi Phí Chăm Sóc",
      ko: "돌봄 비용 계산기"
    },
    "Love RCFE. Thoughtful elder care & California Title 22 guidance.": {
      es: "Love RCFE. Cuidado reflexivo de adultos mayores y asesoría Título 22 de California.",
      zh: "Love RCFE · 加州 Title 22 专业牌照与温暖长者照护指导。",
      tl: "Love RCFE. Maingat na pag-aalaga at gabay sa California Title 22.",
      vi: "Love RCFE. Chăm sóc người cao tuổi tận tâm & hướng dẫn Title 22 California.",
      ko: "Love RCFE. 사려 깊은 어르신 돌봄 및 캘리포니아 Title 22 전문 안내."
    },

    // Attributes (aria-label, title, placeholder)
    "Love RCFE Homepage": {
      es: "Página principal de Love RCFE",
      zh: "Love RCFE 主页",
      tl: "Pangunahing Pahina ng Love RCFE",
      vi: "Trang chủ Love RCFE",
      ko: "Love RCFE 홈페이지"
    },
    "Main navigation": {
      es: "Navegación principal",
      zh: "主导航栏",
      tl: "Pangunahing nabigasyon",
      vi: "Điều hướng chính",
      ko: "주 메뉴"
    },
    "Change language": {
      es: "Cambiar idioma",
      zh: "切换语言",
      tl: "Palitan ang wika",
      vi: "Thay đổi ngôn ngữ",
      ko: "언어 변경"
    },
    "Toggle dark mode": {
      es: "Alternar modo oscuro",
      zh: "切换深色模式",
      tl: "I-toggle ang dark mode",
      vi: "Bật/tắt chế độ tối",
      ko: "다크 모드 전환"
    },
    "Switch to light mode": {
      es: "Cambiar a modo claro",
      zh: "切换至浅色模式",
      tl: "Lumipat sa light mode",
      vi: "Chuyển sang chế độ sáng",
      ko: "라이트 모드로 전환"
    },
    "Switch to dark mode": {
      es: "Cambiar a modo oscuro",
      zh: "切换至深色模式",
      tl: "Lumipat sa dark mode",
      vi: "Chuyển sang chế độ tối",
      ko: "다크 모드로 전환"
    },
    "Toggle navigation menu": {
      es: "Abrir o cerrar menú",
      zh: "展开或收起导航菜单",
      tl: "Buksan ang menu ng nabigasyon",
      vi: "Mở hoặc đóng menu điều hướng",
      ko: "탐색 메뉴 열기/닫기"
    },
    "Care planning tools": {
      es: "Herramientas de planificación",
      zh: "照护规划工具",
      tl: "Mga tool sa pagpaplano",
      vi: "Công cụ lập kế hoạch chăm sóc",
      ko: "돌봄 계획 도구"
    },
    "Open calculator": {
      es: "Abrir calculadora",
      zh: "打开计算器",
      tl: "Buksan ang kalkulador",
      vi: "Mở máy tính",
      ko: "계산기 열기"
    },
    "Hide calculator": {
      es: "Ocultar calculadora",
      zh: "隐藏计算器",
      tl: "Itago ang kalkulador",
      vi: "Ẩn máy tính",
      ko: "계산기 숨기기"
    },
    "Open the budget calculator": {
      es: "Abrir la calculadora de presupuesto",
      zh: "打开预算计算器",
      tl: "Buksan ang kalkulador ng badyet",
      vi: "Mở máy tính ngân sách",
      ko: "예산 계산기 열기"
    },
    "Hide the budget calculator": {
      es: "Ocultar la calculadora de presupuesto",
      zh: "隐藏预算计算器",
      tl: "Itago ang kalkulador ng badyet",
      vi: "Ẩn máy tính ngân sách",
      ko: "예산 계산기 숨기기"
    },
    "Copy result to clipboard": {
      es: "Copiar resultado al portapapeles",
      zh: "复制计算结果到剪贴板",
      tl: "Kopyahin ang resulta sa clipboard",
      vi: "Sao chép kết quả vào khay nhớ tạm",
      ko: "결과를 클립보드에 복사"
    },
    "Apply to Care Inquiry": {
      es: "Aplicar a consulta de cuidado",
      zh: "将金额填入照护咨询",
      tl: "Ilapat sa Pagtatanong",
      vi: "Áp dụng vào biểu mẫu tư vấn",
      ko: "돌봄 문의에 적용하기"
    },
    "Close calculator": {
      es: "Cerrar calculadora",
      zh: "关闭计算器",
      tl: "Isara ang kalkulador",
      vi: "Đóng máy tính",
      ko: "계산기 닫기"
    },
    "Backspace": {
      es: "Retroceso",
      zh: "退格",
      tl: "Burahin",
      vi: "Xóa lùi",
      ko: "지우기"
    },
    "e.g. Eleanor Vance": {
      es: "ej. María González",
      zh: "例如：李明慧",
      tl: "hal. Maria Santos",
      vi: "VD: Nguyễn Minh Anh",
      ko: "예: 홍길동"
    },
    "1234567890": {
      es: "1234567890",
      zh: "1234567890",
      tl: "1234567890",
      vi: "1234567890",
      ko: "1234567890"
    },
    "you@domain.com": {
      es: "usted@correo.com",
      zh: "yourname@example.com",
      tl: "ikaw@domain.com",
      vi: "ban@domain.com",
      ko: "example@email.com"
    },
    "e.g. San Jose, Irvine, Roseville": {
      es: "ej. San José, Irvine, Sacramento",
      zh: "例如：San Jose, Irvine, Pasadena",
      tl: "hal. San Jose, Irvine, Daly City",
      vi: "VD: San Jose, Westminster, Garden Grove",
      ko: "예: San Jose, Irvine, Fullerton"
    },
    "Share your preferred timeline, region, and best time to reach you, or describe your prospective care home project (please omit medical records or SSNs)...": {
      es: "Comparta su plazo deseado, región y mejor horario para contactarle, o describa su proyecto de centro de cuidado (omita historiales médicos o Seguro Social)...",
      zh: "请简述期望入住时间、所在城市与方便联系的时段，或介绍您的 RCFE 开办计划（请勿包含病历或社安号）...",
      tl: "Ibahagi ang nais na petsa, lugar, at pinakamainam na oras upang makontak kayo, o ilarawan ang proyekto ng inyong care home (huwag maglagay ng medikal na rekord o SSN)...",
      vi: "Chia sẻ thời gian dự kiến, khu vực và giờ thuận tiện liên hệ, hoặc mô tả dự án mở nhà chăm sóc của bạn (vui lòng không ghi bệnh án hay số SSN)...",
      ko: "희망 입소 시기, 지역, 연락 가능한 시간대를 알려주시거나 준비 중인 요양홈 개원 계획을 적어주세요(상세 의료 기록 및 SSN 제외)..."
    },
    "Close dialog": {
      es: "Cerrar ventana",
      zh: "关闭弹窗",
      tl: "Isara ang dialog",
      vi: "Đóng hộp thoại",
      ko: "창 닫기"
    },
    "Full name": {
      es: "Nombre completo",
      zh: "姓名",
      tl: "Buong pangalan",
      vi: "Họ và tên",
      ko: "성함"
    },
    "Back to top": {
      es: "Volver arriba",
      zh: "返回顶部",
      tl: "Bumalik sa itaas",
      vi: "Lên đầu trang",
      ko: "맨 위로"
    },

    // Dynamic strings from app.js
    "Open now, closes at 7:00 PM PT": {
      es: "Abierto ahora, cierra a las 7:00 PM PT",
      zh: "当前营业中，今日 7:00 PM PT 结束服务",
      tl: "Bukas ngayon, magsasara sa 7:00 PM PT",
      vi: "Đang mở cửa, đóng lúc 7:00 PM PT",
      ko: "현재 상담 가능 (오후 7:00 PT 마감)"
    },
    "Closed right now, opens today at 8:00 AM PT": {
      es: "Cerrado ahora, abre hoy a las 8:00 AM PT",
      zh: "当前非工作时段，今日 8:00 AM PT 开始服务",
      tl: "Sarado ngayon, magbubukas ngayong araw sa 8:00 AM PT",
      vi: "Hiện đang đóng cửa, mở hôm nay lúc 8:00 AM PT",
      ko: "현재 업무 시간 외 (오늘 오전 8:00 PT 오픈)"
    },
    "Closed right now, opens {when} at 8:00 AM PT": {
      es: "Cerrado ahora, abre {when} a las 8:00 AM PT",
      zh: "当前非工作时段，{when} 8:00 AM PT 开始服务",
      tl: "Sarado ngayon, magbubukas {when} sa 8:00 AM PT",
      vi: "Hiện đang đóng cửa, mở lại {when} lúc 8:00 AM PT",
      ko: "현재 업무 시간 외 ({when} 오전 8:00 PT 오픈)"
    },
    "Closed right now": {
      es: "Cerrado en este momento",
      zh: "当前非工作时段",
      tl: "Sarado ngayon",
      vi: "Hiện đang đóng cửa",
      ko: "현재 업무 시간 외"
    },
    "tomorrow": {
      es: "mañana",
      zh: "明天",
      tl: "bukas",
      vi: "ngày mai",
      ko: "내일"
    },
    "Monday": { es: "el lunes", zh: "周一", tl: "sa Lunes", vi: "Thứ Hai", ko: "월요일" },
    "Tuesday": { es: "el martes", zh: "周二", tl: "sa Martes", vi: "Thứ Ba", ko: "화요일" },
    "Wednesday": { es: "el miércoles", zh: "周三", tl: "sa Miyerkules", vi: "Thứ Tư", ko: "수요일" },
    "Thursday": { es: "el jueves", zh: "周四", tl: "sa Huwebes", vi: "Thứ Năm", ko: "목요일" },
    "Friday": { es: "el viernes", zh: "周五", tl: "sa Biyernes", vi: "Thứ Sáu", ko: "금요일" },
    "Saturday": { es: "el sábado", zh: "周六", tl: "sa Sabado", vi: "Thứ Bảy", ko: "토요일" },
    "Sunday": { es: "el domingo", zh: "周日", tl: "sa Linggo", vi: "Chủ Nhật", ko: "일요일" },
    "The security check could not load. Please turn off ad blockers for this site, or call (818) 217-5755 or email loveRCFE@gmail.com.": {
      es: "No se pudo cargar la verificación de seguridad. Desactive bloqueadores de anuncios para este sitio o llame al (818) 217-5755 / escriba a loveRCFE@gmail.com.",
      zh: "安全验证组件未能加载。请为本站关闭广告拦截插件，或直接致电 (818) 217-5755 / 发送邮件至 loveRCFE@gmail.com。",
      tl: "Hindi mai-load ang security check. Mangyaring patayin ang ad blocker para sa site na ito, o tumawag sa (818) 217-5755 o mag-email sa loveRCFE@gmail.com.",
      vi: "Không tải được bước kiểm tra bảo mật. Vui lòng tắt trình chặn quảng cáo cho trang này, hoặc gọi (818) 217-5755 / email loveRCFE@gmail.com.",
      ko: "보안 확인 모듈을 불러오지 못했습니다. 이 사이트의 광고 차단 기능을 끄시거나 (818) 217-5755 전화 또는 loveRCFE@gmail.com 으로 연락해 주세요."
    },
    "For your privacy, please do not include Social Security numbers in web messages.": {
      es: "Por su privacidad, no incluya números de Seguro Social en mensajes web.",
      zh: "为保护您的隐私，请勿在网页留言中包含社会安全号码（SSN）。",
      tl: "Para sa inyong privacy, huwag isama ang Social Security number sa mga mensahe sa web.",
      vi: "Để bảo vệ quyền riêng tư, vui lòng không nhập số An sinh Xã hội vào tin nhắn trực tuyến.",
      ko: "개인정보 보호를 위해 웹 메시지에 사회보장번호(SSN)를 포함하지 말아 주세요."
    },
    "Please check the highlighted fields.": {
      es: "Por favor revise los campos indicados.",
      zh: "请检查并完善高亮提示的栏目。",
      tl: "Pakisuri ang mga nakasaad na field.",
      vi: "Vui lòng kiểm tra lại các mục được đánh dấu.",
      ko: "입력하신 항목을 다시 확인해 주세요."
    },
    "Please enter or calculate a valid budget amount on the calculator first.": {
      es: "Primero ingrese o calcule un monto de presupuesto válido en la calculadora.",
      zh: "请先在计算器中输入或算出一个有效的预算金额。",
      tl: "Mangyaring maglagay o magkalkula muna ng wastong halaga ng badyet sa kalkulador.",
      vi: "Vui lòng nhập hoặc tính một mức ngân sách hợp lệ trên máy tính trước.",
      ko: "먼저 계산기에서 유효한 예산 금액을 입력하거나 계산해 주세요."
    },
    "Specialized Memory Care Community or Secured RCFE": {
      es: "Comunidad Especializada en Cuidado de la Memoria o RCFE Seguro",
      zh: "专业失智照护社区或带安全门禁的 RCFE",
      tl: "Espesyal na Memory Care Community o Secured RCFE",
      vi: "Cơ Sở Chăm Sóc Trí Nhớ Chuyên Biệt Hoặc RCFE Bảo Vệ",
      ko: "치매 전문 케어 커뮤니티 또는 안전 출입 통제 RCFE"
    },
    "Given memory impairment and potential wandering risks, your loved one requires a state-licensed facility with certified delayed egress security, dementia-trained 24/7 care staff, and predictable sensory routines.": {
      es: "Dado el deterioro de memoria y el riesgo de deambulación, su ser querido necesita un centro con licencia estatal que cuente con puertas certificadas de salida retardada, personal capacitado 24/7 en demencia y rutinas tranquilas.",
      zh: "鉴于记忆受损及潜在走失风险，您的亲人需要配备合规延时安全门禁、全天候受过失智专业培训人员且作息稳定的加州持牌照护机构。",
      tl: "Dahil sa paghina ng memorya at panganib ng paglalagalag, kailangan ng pasilidad na may delayed egress security, kawaning sinanay sa demensya 24/7, at tahimik na iskedyul.",
      vi: "Do suy giảm trí nhớ và nguy cơ đi lạc, người thân cần cơ sở được tiểu bang cấp phép với cửa an toàn trễ mở, nhân viên chuyên về sa sút trí tuệ trực 24/7 và lịch sinh hoạt ổn định.",
      ko: "기억력 저하와 배회 위험을 고려할 때, 지연 개방 보안 출입문 인증, 24시간 치매 전문 교육 인력, 안정적인 일상 루틴을 갖춘 주정부 인가 시설이 필요합니다."
    },
    "Does the home have an approved Dementia Plan of Operation on file with CDSS?": {
      es: "¿El hogar tiene un Plan de Operación para Demencia aprobado ante el CDSS?",
      zh: "该机构是否在 CDSS 备案有获批的失智症运营计划书？",
      tl: "May aprubadong Dementia Plan of Operation ba ang tahanan sa CDSS?",
      vi: "Cơ sở có Kế hoạch Vận hành Chăm sóc Sa sút trí tuệ đã được CDSS phê duyệt chưa?",
      ko: "해당 시설이 CDSS에 승인된 치매 운영 계획서(Dementia Plan of Operation)를 보유하고 있나요?"
    },
    "Are perimeter pathways and exits secured with delayed egress and audible chimes?": {
      es: "¿Los accesos y salidas están protegidos con salida retardada y alarmas audibles?",
      zh: "院区通道和出口是否配有合规延时安全锁与警报提示音？",
      tl: "Ligtas ba ang mga daanan at labasan na may delayed egress at chime?",
      vi: "Lối đi và cửa ra vào có khóa an toàn mở trễ và chuông báo âm thanh không?",
      ko: "외부 통로와 출입문이 지연 개방 보안장치 및 알림 차임으로 보호되어 있나요?"
    },
    "What is the staff-to-resident ratio during the night shift?": {
      es: "¿Cuál es la proporción de cuidadores por residente en el turno nocturno?",
      zh: "夜班期间的护工与长者比例是多少？",
      tl: "Ano ang ratio ng staff sa residente tuwing pang-gabi?",
      vi: "Tỷ lệ nhân viên trên số cư dân trong ca đêm là bao nhiêu?",
      ko: "야간 근무 시간대의 직원 대 입소자 비율은 어떻게 되나요?"
    },
    "How does staff redirect agitation or exit-seeking without chemical sedation?": {
      es: "¿Cómo redirige el personal la agitación o intentos de salida sin sedación química?",
      zh: "工作人员如何在不使用镇静药物的情况下安抚躁动或防走失倾向？",
      tl: "Paano pinapakalma ng kawani ang pagkabalisa nang walang pampakalmang gamot?",
      vi: "Nhân viên xử lý thế nào khi cụ kích động hoặc tìm đường ra mà không dùng thuốc an thần?",
      ko: "약물 진정 없이 초조함이나 외출 충동을 어떻게 안전하게 전환·유도하나요?"
    },
    "High-Acuity Residential Board & Care with Hospice Waiver": {
      es: "Hogar Residencial de Alta Complejidad con Exención de Hospicio",
      zh: "带临终关怀豁免的高强度家庭式照护之家",
      tl: "High-Acuity Residential Board & Care na may Hospice Waiver",
      vi: "Nhà Chăm Sóc Chuyên Sâu Có Miễn Trừ Hospice",
      ko: "호스피스 면제 승인 고중증 주거형 보드앤케어"
    },
    "Because significant help with mobility, turning, or transfers is necessary, an intimate 6-bed residential home provides the essential 1-on-3 caregiver ratio required to prevent falls, skin breakdown, and hospital readmissions.": {
      es: "Dado que requiere apoyo significativo para movilidad, cambios posturales o traslados, una casa residencial de 6 camas brinda la proporción de 1 cuidador por 3 residentes indispensable para prevenir caídas, úlceras y reingresos hospitalarios.",
      zh: "由于长者在行动、翻身和移位方面需要密集协助，温馨的 6 床位家庭式小家所具备的 1 对 3 高护患比能有效预防跌倒、褥疮及反复住院。",
      tl: "Dahil malaking tulong sa paggalaw, pagbaling, at paglipat ang kailangan, ang 6-bed home ay nagbibigay ng mahalagang 1-sa-3 na ratio upang maiwasan ang pagkahulog at muling pagka-ospital.",
      vi: "Vì cần hỗ trợ nhiều trong di chuyển và xoay trở, mô hình nhà 6 giường với tỷ lệ 1 nhân viên chăm 3 cụ rất quan trọng để phòng ngừa té ngã, loét da và tái nhập viện.",
      ko: "거동, 체위 변경, 이동에 상당한 도움이 필요하므로 낙상, 욕창, 재입원을 예방하기 위한 1대3 밀착 케어 비율이 갖춰진 6인실 주거형 요양홈이 최적입니다."
    },
    "Does the facility have an active Bedridden Clearance and Hospice Waiver for the room?": {
      es: "¿El centro cuenta con Autorización para Postrados y Exención de Hospicio activas para esa habitación?",
      zh: "该房间是否拥有现行有效的卧床许可（Bedridden Clearance）和临终关怀豁免（Hospice Waiver）？",
      tl: "May aktibo bang Bedridden Clearance at Hospice Waiver para sa kwartong iyon?",
      vi: "Cơ sở có giấy phép chăm sóc người nằm giường và Hospice Waiver hiệu lực cho phòng đó không?",
      ko: "해당 방에 대해 유효한 와상 입소 승인(Bedridden Clearance)과 호스피스 면제가 적용되나요?"
    },
    "Can caregivers perform 2-person physical transfers or operate a hoyer lift safely?": {
      es: "¿Pueden los cuidadores hacer traslados físicos entre 2 personas o usar grúa Hoyer con seguridad?",
      zh: "护工是否熟练掌握双人协助移位或安全操作 Hoyer 移位机？",
      tl: "Ligtas bang nakakagawa ng 2-person transfer o nakakagamit ng hoyer lift ang mga caregiver?",
      vi: "Nhân viên có thể hỗ trợ chuyển người bằng 2 người hoặc vận hành thiết bị nâng Hoyer an toàn không?",
      ko: "요양보호사들이 2인 신체 이동 보조 또는 호이어 리프트(Hoyer lift)를 안전하게 다룰 수 있나요?"
    },
    "How frequently are non-ambulatory residents turned and repositioned?": {
      es: "¿Con qué frecuencia cambian de posición a los residentes no ambulatorios?",
      zh: "对于无法行动的长者，护工每隔多久协助翻身一次？",
      tl: "Gaano kadalas pinipihit o binabago ng posisyon ang mga residenteng nakaratay?",
      vi: "Cư dân không tự đi lại được xoay trở thay đổi tư thế bao lâu một lần?",
      ko: "거동이 불가능한 입소자의 체위 변경은 얼마나 자주 시행하나요?"
    },
    "Does the visiting home health or hospice nurse have direct 24/7 coordination with staff?": {
      es: "¿La enfermera visitante o de hospicio tiene coordinación directa 24/7 con el personal?",
      zh: "上门居家医疗或临终关怀护士是否与院内员工保持全天候直接联动？",
      tl: "May direktang 24/7 na koordinasyon ba sa kawani ang bumibisitang nurse o hospice?",
      vi: "Y tá chăm sóc tại nhà hoặc hospice có phối hợp trực tiếp 24/7 với nhân viên nhà ở không?",
      ko: "방문 간호사 또는 호스피스 간호사와 시설 직원 간 24시간 직접 연락 체계가 있나요?"
    },
    "Assisted Living Community / Independent Living": {
      es: "Comunidad de Vivienda Asistida / Vida Independiente",
      zh: "协助生活社区 / 独立康养社区",
      tl: "Assisted Living Community / Independent Living",
      vi: "Cộng Đồng Sinh Hoạt Có Hỗ Trợ / Tự Lập",
      ko: "어시스티드 리빙 커뮤니티 / 시니어 독립 주거"
    },
    "Your loved one remains largely independent but will thrive with nutritious meal service, vibrant social activities, housekeeping, and medication cueing to maintain dignity and prevent loneliness.": {
      es: "Su ser querido mantiene gran independencia, pero disfrutará mucho más con comidas nutritivas, actividades sociales dinámicas, limpieza y recordatorios de medicinas para preservar su dignidad y evitar el aislamiento.",
      zh: "您的亲人目前仍保持较高的自理能力，社区提供的营养膳食、丰富社交活动、家政清洁及用药提醒将有助于维护生活尊严并告别孤单。",
      tl: "Malaki pa ang kakayahang mag-isa ng inyong mahal sa buhay, ngunit mas magiging masigla siya sa masustansyang pagkain, aktibidad, paglilinis, at paalala sa gamot upang maiwasan ang pag-iisa.",
      vi: "Người thân của bạn vẫn tự lập phần lớn, nhưng sẽ sống vui khỏe hơn với bữa ăn dinh dưỡng, hoạt động giao lưu sôi nổi, dọn dẹp và nhắc uống thuốc để tránh cô đơn.",
      ko: "어르신께서 대체로 자립적이시므로 균형 잡힌 식사, 활기찬 사교 프로그램, 가사 지원, 복약 알림이 어우러진 환경에서 존엄성과 활력을 유지하실 수 있습니다."
    },
    "What social activities, gardening, and creative programs take place daily?": {
      es: "¿Qué actividades sociales, de jardinería y programas creativos se realizan diariamente?",
      zh: "每天有哪些社交活动、园艺或创意兴趣课程？",
      tl: "Anong mga aktibidad na panlipunan, paghahalaman, at malikhaing programa ang ginagawa araw-araw?",
      vi: "Cơ sở tổ chức những hoạt động giao lưu, làm vườn và sáng tạo nào hàng ngày?",
      ko: "매일 어떤 사교 모임, 원예 활동, 창의적 프로그램이 운영되나요?"
    },
    "Are transportation services provided for doctor appointments and shopping?": {
      es: "¿Ofrecen transporte para citas médicas y compras?",
      zh: "是否为就医复诊和日常购物提供接送交通服务？",
      tl: "May serbisyong transportasyon ba para sa appointment sa doktor at pamimili?",
      vi: "Có dịch vụ đưa đón đi khám bác sĩ và mua sắm không?",
      ko: "병원 진료 예약 및 쇼핑을 위한 차량 이동 서비스가 제공되나요?"
    },
    "How are changes in health or subtle cognitive changes reported to family?": {
      es: "¿Cómo informan a la familia sobre cambios sutiles de salud o memoria?",
      zh: "当长者身体或认知出现细微变化时，机构如何及时向家属沟通？",
      tl: "Paano ipinapaalam sa pamilya ang pagbabago sa kalusugan o memorya?",
      vi: "Cơ sở thông báo thế nào cho gia đình khi sức khỏe hoặc nhận thức có thay đổi nhẹ?",
      ko: "건강이나 인지 기능에 미세한 변화가 생겼을 때 가족에게 어떻게 알리나요?"
    },
    "Are medications managed and logged by trained caregivers under strict physician orders?": {
      es: "¿Los medicamentos son administrados y registrados por cuidadores capacitados bajo estricta orden médica?",
      zh: "药品是否由受过专业培训的照护人员严格遵医嘱给药并逐次登记？",
      tl: "Pinamamahalaan at itinatala ba ng sinanay na caregiver ang mga gamot ayon sa utos ng doktor?",
      vi: "Thuốc có được nhân viên đào tạo quản lý và ghi chép nghiêm ngặt theo chỉ định bác sĩ không?",
      ko: "투약이 전문 교육을 받은 요양보호사에 의해 의사 처방대로 철저히 관리·기록되나요?"
    },
    "Is night staff awake or on-call sleep? (Awake staff is strongly recommended).": {
      es: "¿El personal nocturno permanece despierto o duerme de guardia? (Se recomienda ampliamente personal despierto).",
      zh: "夜间工作人员是整夜清醒值班还是待命睡眠？（强烈建议选择清醒值班）。",
      tl: "Gising ba ang staff sa gabi o natutulog na on-call? (Mas inirerekomenda ang gising na staff).",
      vi: "Nhân viên ca đêm có thức trực hoàn toàn hay ngủ trực? (Rất khuyến khích có người thức trực).",
      ko: "야간 직원이 밤새 깨어 상주하나요, 아니면 취침 대기(on-call)인가요? (상시 깨어 있는 인력을 강력히 권장합니다)."
    },
    "Can residents bring their own familiar bedroom furniture?": {
      es: "¿Pueden los residentes traer sus propios muebles familiares para el dormitorio?",
      zh: "入住长者是否可以携带自己熟悉的卧室家具？",
      tl: "Maaari bang magdala ang residente ng sariling pamilyar na muwebles sa kwarto?",
      vi: "Cư dân có thể mang theo đồ nội thất phòng ngủ quen thuộc của riêng mình không?",
      ko: "입소 시 익숙한 본인 방 가구를 가져와 배치할 수 있나요?"
    },
    "What is the monthly rate stability policy when care needs increase?": {
      es: "¿Cuál es la política de estabilidad de tarifa mensual si aumentan las necesidades de cuidado?",
      zh: "当照护需求增加时，月费调整的稳定政策是怎样的？",
      tl: "Ano ang patakaran sa presyo kapag nadagdagan ang pangangailangan sa pag-aalaga?",
      vi: "Chính sách ổn định mức phí hàng tháng khi nhu cầu chăm sóc tăng lên như thế nào?",
      ko: "추후 돌봄 필요도가 높아질 때 월 비용 인상 및 안정화 기준은 어떻게 되나요?"
    },
    "Please fill out all required fields.": {
      es: "Por favor complete todos los campos obligatorios.",
      zh: "请填写所有必填栏目。",
      tl: "Pakipunan ang lahat ng kinakailangang field.",
      vi: "Vui lòng điền đầy đủ các mục bắt buộc.",
      ko: "필수 입력 항목을 모두 작성해 주세요."
    },
    "We make calls Monday through Saturday. Please pick another date.": {
      es: "Realizamos llamadas de lunes a sábado. Por favor elija otra fecha.",
      zh: "我们的电话服务时间为周一至周六，请选择其他日期。",
      tl: "Lunes hanggang Sabado lang kami tumatawag. Pumili ng ibang petsa.",
      vi: "Chúng tôi gọi từ Thứ Hai đến Thứ Bảy. Vui lòng chọn ngày khác.",
      ko: "전화 상담은 월요일부터 토요일까지 가능합니다. 다른 날짜를 선택해 주세요."
    },
    "Sending your call request…": {
      es: "Enviando su solicitud de llamada…",
      zh: "正在发送您的通话预约请求…",
      tl: "Ipinapadala ang inyong hiling na tawag…",
      vi: "Đang gửi yêu cầu gọi lại của bạn…",
      ko: "전화 상담 예약을 전송하고 있습니다…"
    },
    "✓ Request received. An advisor will call you on {date} ({time}) to confirm.": {
      es: "✓ Solicitud recibida. Un asesor le llamará el {date} ({time}) para confirmar.",
      zh: "✓ 已收到您的预约。顾问将于 {date}（{time}）致电与您确认。",
      tl: "✓ Natanggap ang kahilingan. Tatawagan kayo ng tagapayo sa {date} ({time}) upang kumpirmahin.",
      vi: "✓ Đã nhận yêu cầu. Chuyên viên sẽ gọi cho bạn vào {date} ({time}) để xác nhận.",
      ko: "✓ 예약 요청이 접수되었습니다. 상담사가 {date} ({time})에 확인 전화를 드리겠습니다."
    },
    "Sending your confidential enquiry…": {
      es: "Enviando su consulta confidencial…",
      zh: "正在发送您的保密咨询…",
      tl: "Ipinapadala ang inyong kumpidensyal na mensahe…",
      vi: "Đang gửi thông tin tư vấn bảo mật của bạn…",
      ko: "비밀이 보장되는 상담 문의를 전송하고 있습니다…"
    },
    "✓ Thank you, {name}. Your message was sent. An elder care advisor will reply within 1 business day.": {
      es: "✓ Gracias, {name}. Su mensaje fue enviado. Un asesor responderá dentro de 1 día hábil.",
      zh: "✓ 感谢您，{name}。您的留言已送达，我们的长者照护顾问将在 1 个工作日内回复您。",
      tl: "✓ Salamat, {name}. Naipadala na ang inyong mensahe. Sasagot ang aming tagapayo sa loob ng 1 araw ng trabaho.",
      vi: "✓ Cảm ơn {name}. Tin nhắn đã được gửi thành công. Chuyên viên sẽ phản hồi trong vòng 1 ngày làm việc.",
      ko: "✓ 감사합니다, {name}님. 메시지가 성공적으로 전송되었습니다. 담당 상담사가 영업일 기준 1일 이내에 답변드리겠습니다."
    },
    "If your email app didn't open automatically, ": {
      es: "Si su aplicación de correo no se abrió automáticamente, ",
      zh: "如果您的邮件应用未自动打开，请 ",
      tl: "Kung hindi kusang bumukas ang inyong email app, ",
      vi: "Nếu ứng dụng email chưa tự động mở, ",
      ko: "이메일 앱이 자동으로 열리지 않았다면 "
    },
    "click here to send by email": {
      es: "haga clic aquí para enviar por correo",
      zh: "点击此处通过邮件发送",
      tl: "i-click ito upang ipadala sa email",
      vi: "nhấn vào đây để gửi qua email",
      ko: "여기를 클릭해 이메일로 보내기"
    },
    ", email ": {
      es: ", escriba a ",
      zh: "，发送邮件至 ",
      tl: ", mag-email sa ",
      vi: ", gửi email về ",
      ko: ", 또는 "
    },
    ", or call {phone}.": {
      es: ", o llame al {phone}.",
      zh: "，或致电 {phone}。",
      tl: ", o tumawag sa {phone}.",
      vi: ", hoặc gọi {phone}.",
      ko: " 번호로 전화해 주세요."
    }
  };

  var origTextMap = new WeakMap();
  var origAttrMap = new WeakMap();
  var origBlockMap = new WeakMap();
  var changeListeners = [];
  var initialized = false;

  var currentLang = getSavedLang();
  try { document.documentElement.lang = currentLang; } catch (e) {}

  function getSavedLang() {
    try {
      var q = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : '';
      if (q && LANGUAGES[q]) return q;
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGUAGES[saved]) return saved;
    } catch (e) {}
    return 'en';
  }

  function saveLang(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
  }

  function t(text, vars) {
    var raw = String(text || '');
    var out = raw;
    if (currentLang !== 'en' && DICT[raw] && DICT[raw][currentLang]) {
      out = DICT[raw][currentLang];
    }
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        out = out.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return out;
  }

  function shouldSkipNode(node) {
    var parent = node.parentElement;
    if (!parent) return true;
    var tag = parent.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG') return true;
    if (parent.closest && (parent.closest('svg') || parent.closest('.lang-option') || parent.closest('[data-i18n-block]') || parent.closest('[data-i18n-skip]'))) {
      return true;
    }
    return false;
  }

  function applyDom(root) {
    var container = root || document;
    if (!document.body) return;

    // 1. Mixed-HTML blocks tagged with data-i18n-block
    var blocks = container.querySelectorAll ? container.querySelectorAll('[data-i18n-block]') : [];
    blocks.forEach(function (el) {
      if (!origBlockMap.has(el)) {
        origBlockMap.set(el, el.innerHTML);
      }
      var key = el.getAttribute('data-i18n-block');
      if (currentLang === 'en') {
        el.innerHTML = origBlockMap.get(el);
      } else if (BLOCKS[key] && BLOCKS[key][currentLang]) {
        el.innerHTML = BLOCKS[key][currentLang];
      }
    });

    // 2. Attributes: placeholder, title, aria-label
    var attrNames = ['placeholder', 'title', 'aria-label'];
    var withAttrs = container.querySelectorAll ? container.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    withAttrs.forEach(function (el) {
      if (el.closest && el.closest('.lang-option')) return;
      var saved = origAttrMap.get(el);
      if (!saved) {
        saved = {};
        attrNames.forEach(function (attr) {
          if (el.hasAttribute(attr)) {
            saved[attr] = el.getAttribute(attr);
          }
        });
        origAttrMap.set(el, saved);
      }
      Object.keys(saved).forEach(function (attr) {
        var origVal = saved[attr];
        var norm = String(origVal || '').replace(/\s+/g, ' ').trim();
        if (currentLang === 'en') {
          el.setAttribute(attr, origVal);
        } else if (DICT[norm] && DICT[norm][currentLang]) {
          el.setAttribute(attr, DICT[norm][currentLang]);
        }
      });
    });

    // 3. Text nodes (preserves sibling Lucide SVG icons & surrounding spacing)
    var scanRoot = container === document ? document.body : container;
    if (scanRoot && document.createTreeWalker) {
      var walker = document.createTreeWalker(scanRoot, NodeFilter.SHOW_TEXT, null);
      var textNode;
      while ((textNode = walker.nextNode())) {
        if (shouldSkipNode(textNode)) continue;
        if (!origTextMap.has(textNode)) {
          origTextMap.set(textNode, textNode.nodeValue);
        }
        var orig = origTextMap.get(textNode);
        var trimmed = orig.replace(/\s+/g, ' ').trim();
        if (!trimmed || !DICT[trimmed]) continue;
        var leadMatch = orig.match(/^\s*/);
        var trailMatch = orig.match(/\s*$/);
        var lead = leadMatch ? leadMatch[0] : '';
        var trail = trailMatch ? trailMatch[0] : '';
        var translated = currentLang === 'en' ? trimmed : (DICT[trimmed][currentLang] || trimmed);
        var nextVal = lead + translated + trail;
        if (textNode.nodeValue !== nextVal) {
          textNode.nodeValue = nextVal;
        }
      }
    }

    // 4. Refresh Lucide icons inside replaced blocks
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function updateHeaderControls() {
    var meta = LANGUAGES[currentLang] || LANGUAGES.en;
    document.documentElement.lang = currentLang;

    document.querySelectorAll('.lang-current-code').forEach(function (el) {
      el.textContent = meta.code;
    });

    document.querySelectorAll('.lang-option[data-lang]').forEach(function (btn) {
      var active = btn.getAttribute('data-lang') === currentLang;
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
      var check = btn.querySelector('.lang-check');
      if (check) {
        if (active) check.classList.remove('hidden');
        else check.classList.add('hidden');
      }
    });
  }

  function closeMenus() {
    var pairs = [
      ['lang-dropdown', 'lang-toggle-btn'],
      ['lang-dropdown-mobile', 'lang-toggle-btn-mobile']
    ];
    pairs.forEach(function (pair) {
      var menu = document.getElementById(pair[0]);
      var btn = document.getElementById(pair[1]);
      if (menu) menu.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMenu(which) {
    var isMobile = which === 'mobile';
    var menuId = isMobile ? 'lang-dropdown-mobile' : 'lang-dropdown';
    var btnId = isMobile ? 'lang-toggle-btn-mobile' : 'lang-toggle-btn';
    var otherMenuId = isMobile ? 'lang-dropdown' : 'lang-dropdown-mobile';
    var otherBtnId = isMobile ? 'lang-toggle-btn' : 'lang-toggle-btn-mobile';

    var otherMenu = document.getElementById(otherMenuId);
    var otherBtn = document.getElementById(otherBtnId);
    if (otherMenu) otherMenu.classList.add('hidden');
    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');

    var menu = document.getElementById(menuId);
    var btn = document.getElementById(btnId);
    if (!menu || !btn) return;

    var willOpen = menu.classList.contains('hidden');
    if (willOpen) {
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      var checked = menu.querySelector('.lang-option[aria-checked="true"]') || menu.querySelector('.lang-option');
      if (checked) {
        try { checked.focus(); } catch (e) {}
      }
    } else {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function setLang(code) {
    var next = LANGUAGES[code] ? code : 'en';
    currentLang = next;
    saveLang(next);
    updateHeaderControls();
    applyDom(document);
    closeMenus();
    changeListeners.forEach(function (fn) {
      try { fn(next); } catch (e) {}
    });
  }

  function init() {
    currentLang = getSavedLang();
    updateHeaderControls();
    applyDom(document);
    initialized = true;
  }

  function bindGlobalMenuEvents() {
    document.addEventListener('click', function (e) {
      var toggleBtn = e.target && e.target.closest ? e.target.closest('[data-lang-toggle]') : null;
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu(toggleBtn.getAttribute('data-lang-toggle'));
        return;
      }

      var langBtn = e.target && e.target.closest ? e.target.closest('.lang-option[data-lang]') : null;
      if (langBtn) {
        e.preventDefault();
        setLang(langBtn.getAttribute('data-lang'));
        return;
      }

      if (!e.target || !e.target.closest || !e.target.closest('#lang-menu-wrap, #lang-menu-wrap-mobile')) {
        closeMenus();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMenus();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target && e.target.closest) {
        var menu = e.target.closest('.lang-dropdown');
        if (menu && !menu.classList.contains('hidden')) {
          var items = Array.prototype.slice.call(menu.querySelectorAll('.lang-option'));
          var idx = items.indexOf(e.target.closest('.lang-option'));
          if (idx !== -1 && items.length) {
            e.preventDefault();
            var nextIdx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
            items[nextIdx].focus();
          }
        }
      }
    });
  }

  bindGlobalMenuEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!initialized) init();
    });
  } else {
    init();
  }
  if (document.body && !initialized) {
    init();
  }

  window.LoveI18n = {
    init: init,
    setLang: setLang,
    getLang: function () { return currentLang; },
    getIntlLocale: function () { return (LANGUAGES[currentLang] && LANGUAGES[currentLang].intl) || 'en-US'; },
    t: t,
    applyDom: applyDom,
    toggleMenu: toggleMenu,
    closeMenus: closeMenus,
    onChange: function (fn) {
      if (typeof fn === 'function') changeListeners.push(fn);
    },
    LANGUAGES: LANGUAGES,
    DICT: DICT,
    BLOCKS: BLOCKS
  };
})();
