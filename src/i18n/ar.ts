import { Traductions } from "./fr"

/*
 * L'arabe. Même typage que l'anglais : `Partial` du français.
 *
 * Les chaînes portent des chiffres arabes ORIENTAUX seulement là où
 * elles sont purement décoratives. Partout où un nombre vient des
 * données (une moyenne, un effectif), il est laissé au formatage
 * habituel : un bulletin doit pouvoir être relu par quelqu'un qui ne lit
 * pas l'arabe.
 */
export const ar: Traductions = {
  // ---- Commun ------------------------------------------------------
  "commun.chargement": "جارٍ التحميل...",
  "commun.enregistrer": "حفظ",
  "commun.annuler": "إلغاء",
  "commun.fermer": "إغلاق",
  "commun.modifier": "تعديل",
  "commun.supprimer": "حذف",
  "commun.rechercher": "بحث",
  "commun.retour": "رجوع",
  "commun.retourTableauDeBord": "العودة إلى لوحة التحكم",
  "commun.imprimer": "طباعة",
  "commun.oui": "نعم",
  "commun.non": "لا",
  "commun.aucunResultat": "لا توجد نتائج.",
  "commun.erreurChargement": "فشل التحميل. حاول مرة أخرى.",
  "commun.langue": "اللغة",

  // ---- Navigation --------------------------------------------------
  "nav.tableauDeBord": "لوحة التحكم",
  "nav.statistiques": "الإحصائيات",
  "nav.surveillance": "المراقبة",
  "nav.eleves": "التلاميذ",
  "nav.passageDeClasse": "الانتقال إلى القسم الأعلى",
  "nav.cartesScolaires": "البطاقات المدرسية",
  "nav.enseignants": "المدرّسون",
  "nav.classes": "الأقسام",
  "nav.directions": "الإدارات",
  "nav.matieres": "المواد",
  "nav.classesMatieres": "الأقسام / المواد",
  "nav.anneeScolaire": "السنة الدراسية",
  "nav.emploiDuTemps": "جدول الحصص",
  "nav.evaluations": "الفروض",
  "nav.notes": "النقاط",
  "nav.moyennes": "المعدلات",
  "nav.bulletins": "كشوف النقاط",
  "nav.presences": "الحضور",
  "nav.comptabilite": "المحاسبة",
  "nav.maRemuneration": "أجري",
  "nav.activite": "النشاط",
  "nav.comptes": "حسابات المستخدمين",
  "nav.parametres": "الإعدادات",
  "nav.sauvegarde": "نسخة احتياطية",
  "nav.deconnexion": "تسجيل الخروج",
  "nav.menu": "القائمة",

  // ---- Connexion ---------------------------------------------------
  "connexion.titre": "تسجيل الدخول",
  "connexion.sousTitre": "ادخل إلى فضاء مدرستك",
  "connexion.email": "البريد الإلكتروني",
  "connexion.motDePasse": "كلمة السر",
  "connexion.seConnecter": "دخول",
  "connexion.connexionEnCours": "جارٍ الدخول...",
  "connexion.avecGoogle": "المتابعة عبر Google",
  "connexion.retourAccueil": "← العودة إلى الصفحة الرئيسية",
  "connexion.pasDAcces": "مدرستك ليس لها حساب بعد؟ اطلب واحدًا",
  "connexion.echec": "فشل الدخول. تحقق من بريدك وكلمة السر.",

  // ---- Demande d'accès ---------------------------------------------
  "demande.titre": "طلب فتح حساب",
  "demande.intro":
    "لا يُفتح رضوان لأي كان: كل مؤسسة تدخل عبر ترخيص اسمي. ترسل هذه الصفحة طلبك، ثم نتصل بك، ويُفتح حساب مدرستك بعد ذلك بهذا الترخيص.",
  "demande.identifiezVous":
    "ابدأ بتعريف نفسك. سيُربط الترخيص بهذا العنوان، وبه وحده.",
  "demande.jAiUnCompte": "لدي حساب بالفعل",
  "demande.titreFormulaire": "مؤسستك",
  "demande.introFormulaire":
    "تُستعمل هذه المعلومات لدراسة طلبك. لم يُنشأ شيء بعد.",
  "demande.votreAdresse": "عنوانك",
  "demande.adresseAide": "مأخوذ من تسجيل دخولك. سيُربط الترخيص به.",
  "demande.nomEcole": "اسم المؤسسة",
  "demande.ville": "المدينة",
  "demande.typeEcole": "نوع المؤسسة",
  "demande.whatsapp": "رقم واتساب",
  "demande.nomPromoteur": "اسم صاحب المؤسسة",
  "demande.envoyer": "إرسال الطلب",
  "demande.envoiEnCours": "جارٍ الإرسال...",
  "demande.recueTitre": "تم استلام الطلب",
  "demande.recueTexte":
    "سنتصل بك على الرقم الذي قدمته. إذا قُبل طلبك، سيُربط الترخيص بالحساب الذي دخلت به الآن — ادخل حينها بالحساب نفسه، وستتمكن من فتح مؤسستك.",
  "demande.retourConnexion": "العودة إلى تسجيل الدخول",

  // ---- Tableau de bord ---------------------------------------------
  "tdb.bonjour": "مرحبًا {prenom}",
  "tdb.sousTitre": "إليك أهم ما يجري في مؤسستك اليوم.",
  "tdb.eleves": "التلاميذ",
  "tdb.classes": "الأقسام",
  "tdb.enseignants": "المدرّسون",
  "tdb.presencesDuJour": "حضور اليوم",
  "tdb.perimetreDirection": "النطاق: إدارة {direction}",
  "tdb.erreurPartielle": "تعذّر تحميل بعض البيانات. أعد تحميل الصفحة.",

  // ---- Élèves ------------------------------------------------------
  "eleves.titre": "التلاميذ",
  "eleves.sousTitre": "سجّل تلاميذ مؤسستك وتابعهم.",
  "eleves.ajouter": "إضافة تلميذ",
  "eleves.liste": "قائمة التلاميذ",
  "eleves.compte": "{nombre} تلميذ",
  "eleves.compteFiltre": "{filtres} تلميذ من {total}",
  "eleves.aucun": "لا يوجد أي تلميذ مسجّل حاليًا.",
  "eleves.prenom": "الاسم الشخصي",
  "eleves.nom": "الاسم العائلي",
  "eleves.matricule": "رقم التسجيل",
  "eleves.dateNaissance": "تاريخ الازدياد",
  "eleves.sexe": "الجنس",
  "eleves.masculin": "ذكر",
  "eleves.feminin": "أنثى",
  "eleves.adresse": "العنوان",
  "eleves.parent": "ولي الأمر",
  "eleves.telephoneParent": "هاتف ولي الأمر",
  "eleves.classe": "القسم",
  "eleves.rechercherUnEleve": "البحث عن تلميذ",
  "eleves.historique": "السجل",
  "eleves.rapportMensuel": "التقرير الشهري",
  "eleves.aucuneClasse": "بدون قسم",

  // ---- Notes -------------------------------------------------------
  "notes.titre": "النقاط",
  "notes.sousTitre": "أدخل نقاط فروضك وصحّحها.",
  "notes.evaluation": "الفرض",
  "notes.note": "النقطة",
  "notes.sur": "من {max}",
  "notes.enregistrer": "حفظ النقاط",
  "notes.enregistrement": "جارٍ الحفظ...",
  "notes.enregistrees": "تم حفظ النقاط.",
  "notes.aucuneEvaluation": "لا يوجد فرض لهذا القسم وهذه الفترة.",
  "notes.aucunEleve": "لا يوجد تلميذ مسجّل في هذا القسم.",
  "notes.horsLigne":
    "أنت غير متصل. تُحفظ النقاط وتُرسل عند عودة الشبكة.",
  "notes.enAttenteSync": "{nombre} نقطة في انتظار الإرسال.",
  "notes.total": "المجموع",
  "notes.moyenne": "المعدل",
  "notes.rang": "الرتبة",
  "notes.saisieReserveeDirecteur": "في هذا القسم، يُدخل المدير النقاط.",
  "notes.saisieReserveeEnseignant": "في هذا القسم، يُدخل المدرّس النقاط.",

  // ---- Bulletin ----------------------------------------------------
  "bulletin.titre": "كشوف النقاط",
  "bulletin.sousTitre": "أصدر كشوف نقاط القسم واطبعها.",
  "bulletin.bulletinScolaire": "كشف النقاط المدرسي",
  "bulletin.periode": "الفترة",
  "bulletin.anneeScolaire": "السنة الدراسية",
  "bulletin.matiere": "المادة",
  "bulletin.moyenne": "المعدل",
  "bulletin.coefficient": "المعامل",
  "bulletin.moyenneGenerale": "المعدل العام",
  "bulletin.rang": "الرتبة",
  "bulletin.appreciation": "الملاحظة",
  "bulletin.excellent": "ممتاز",
  "bulletin.tresBien": "حسن جدًا",
  "bulletin.bien": "حسن",
  "bulletin.passable": "مقبول",
  "bulletin.insuffisant": "غير كافٍ",
  "bulletin.absences": "الغيابات",
  "bulletin.retards": "التأخرات",
  "bulletin.imprimerTout": "طباعة جميع الكشوف",
  "bulletin.aucun": "لا يوجد كشف لإصداره بهذا الاختيار.",
  "bulletin.signature": "توقيع الإدارة",

  // ---- Sélecteur de langue -----------------------------------------
  "langue.choisir": "اختر اللغة",
  "langue.enregistree": "تم حفظ اللغة.",
}
