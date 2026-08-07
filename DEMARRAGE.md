# Ouvrir une école : l'ordre des choses

Ce document existe parce que plusieurs règles de séquence ne se
découvrent qu'en butant dessus. Elles sont volontaires et toutes
justifiées — mais un directeur seul devant son écran n'a aucune raison de
les deviner.

L'ordre ci-dessous a été **rejoué en base sous les vrais jetons de chaque
rôle**, sur une école réelle, les 7 et 8 août 2026.

---

## Qui fait quoi

| Étape | Qui | Écran |
|---|---|---|
| 1. Année scolaire | Directeur général | Année scolaire |
| 2. Nommer les directeurs | Directeur général | Comptes utilisateurs |
| 3. Matières | Directeur général — ou chaque directeur pour sa filière | Matières |
| 4. Classes | Directeur | Classes |
| 5. Enseignants | Directeur | Enseignants |
| 6. **Affecter** matière + enseignant + coefficient | Directeur | Classes / Matières |
| 7. Titulaires *(premier cycle)* | Directeur | Classes / Matières |
| 8. Emploi du temps | Directeur | Emploi du temps |
| 9. Élèves | Directeur | Élèves |

Le **promoteur** n'écrit rien de tout cela : il consulte. C'est voulu —
il possède l'école, il ne la tient pas.

L'étape « Directions » a disparu de la liste : en école franco-arabe, la
direction se crée toute seule au moment de nommer le directeur (voir
ci-dessous). L'écran Directions reste pour la consulter, la renommer et
y rattacher des classes.

---

## L'affectation, et pourquoi elle n'est pas un doublon

C'est la question qui revient : *pourquoi affecter une matière à une
classe, puisque l'emploi du temps redemande la matière ?*

Parce que **l'affectation et l'emploi du temps ne disent pas la même
chose**. L'affectation dit *quoi et par qui* ; l'emploi du temps dit
*quand*.

L'affectation porte trois choses que rien d'autre ne porte :

| | |
|---|---|
| **le programme de la classe** | quelles matières comptent pour elle |
| **le coefficient** | il pondère les moyennes et le bulletin |
| **l'accès de l'enseignant** | c'est par là qu'il voit sa classe, saisit ses notes, fait son appel |

**L'emploi du temps ne propose donc que des couples déjà affectés**, et
n'offre plus de choix d'enseignant : il affiche celui de l'affectation.
Sans cette fermeture, on pouvait poser un créneau pour une matière qui ne
compte dans aucun bulletin, et confier ce créneau à quelqu'un d'autre que
l'enseignant de la matière — deux vérités pour la même chose.

Si la liste est vide sur l'emploi du temps, ce n'est pas qu'il manque des
matières dans l'école : c'est qu'aucune n'est encore **affectée à cette
classe-là**.

---

## Les règles de séquence qui surprennent

### L'année scolaire d'abord, sinon rien

Sans année scolaire **active**, un élève ne peut pas être inscrit en
classe, et aucun message ne part vers les familles. L'inscription porte
l'année : sans elle, on ne saurait pas de quelle rentrée on parle, et
l'effectif d'une classe mélangerait les promotions.

### Un enseignant sans numéro WhatsApp est refusé

> *Le numéro WhatsApp est obligatoire pour enregistrer un enseignant.*

C'est le seul moyen de le joindre, et un numéro manquant ne se découvre
qu'au moment d'écrire — trop tard. Le numéro est aussi unique : deux
fiches ne peuvent pas le partager.

### Le titulaire avant l'emploi du temps, au premier cycle

> *La classe 1er Année A est en premier cycle : nommez d'abord son
> titulaire arabe avant de lui composer un emploi du temps.*

Au premier cycle, un seul enseignant tient la classe. Le nommer une fois
évite de le répéter sur chaque créneau, et c'est ce qui lui ouvre l'accès
à toute la classe sans lister ses douze matières. Au second cycle et au
lycée la règle ne s'applique pas : chaque créneau porte son enseignant.

En école franco-arabe, la classe a **deux** titulaires — un par filière.

### Une matière sans programme est une matière morte

En école franco-arabe, une matière créée **sans filière** n'est visible
d'aucun directeur de filière. Le directeur général peut en créer — pour
une matière réellement commune — mais elle n'apparaîtra dans le programme
de personne. L'écran le dit avant qu'on valide.

---

## L'école franco-arabe : les directions marchent en couple

Cette section ne concerne **que** les écoles franco-arabes. Une école
classique n'a ni filière, ni couple : elle lit la moitié haute de ce
document et s'arrête là.

### Le couple

Une direction est identifiée par **(cycle, lettre)** — et la **filière**
distingue les deux directeurs qui la tiennent :

```
Premier cycle · A     Second cycle · A
  ├── arabe    → un directeur    ├── arabe    → un directeur
  └── français → un directeur    └── français → un directeur
```

« Français A » et « Arabe A » du premier cycle forment un couple :
**ce sont les mêmes enfants**. « Français B » et « Arabe B » en forment
un autre, avec d'autres enfants.

### Ce que le couple partage, et ce qu'il ne partage pas

| Partagé | Propre à chaque directeur |
|---|---|
| classes | matières et leur coefficient |
| élèves et inscriptions | titulaires |
| codes d'accès des familles | évaluations, notes, moyennes, bulletins |
| présences journalières | emploi du temps, devoirs |
| | enseignants |

Les **présences journalières** sont partagées par *construction* et non
par choix : la table n'admet qu'une ligne par enfant et par jour. Un
enfant ne peut donc pas être absent en français et présent en arabe le
même jour.

### Nommer un directeur

Sur **Comptes utilisateurs**, on choisit **filière + cycle + lettre**, et
la direction correspondante est retrouvée — ou créée si elle manque. Plus
besoin d'aller la fabriquer ailleurs puis de revenir.

**La lettre compte.** Se tromper de lettre met un directeur devant les
enfants d'un autre couple. « Sans lettre » reste possible : c'est le
couple unique d'un cycle.

### Les matières

Chaque directeur crée et modifie **les matières de sa filière**, et
seulement celles-là. Il ne choisit pas son programme : l'écran affiche le
sien. La **suppression** reste au directeur général — une matière
supprimée emporte ses affectations, ses évaluations et les notes qui en
dépendent.

### Les enseignants ne se partagent pas

Même deux directeurs de la même filière et de cycles différents ne
partagent pas leur personnel. Un enseignant appartient au directeur qui
l'a enregistré, jusqu'à ce qu'il tienne une matière ou une classe — après
quoi ce sont ses affectations qui décident.

Un enseignant enregistré par le **directeur général** reste visible de
tous les directeurs tant qu'il n'est affecté nulle part : c'est le
recrutement central.

---

## Ce que le directeur ne peut pas faire, et pourquoi

- **Aucune direction ne lui est rattachée** → ses écrans sont vides. Le
  bandeau le dit. C'est au directeur général de le rattacher.
- **Le cycle de ses classes ne lui est pas demandé** : il vient de sa
  direction. Une direction du premier cycle ne peut pas contenir une
  classe de lycée, ni à la création ni par rattachement après coup.
- **Il ne renomme pas les classes du couple** : créer, renommer ou
  supprimer une classe reste au directeur qui la porte. L'autre la voit
  et s'en sert.
- **Un élève pas encore placé en classe** est visible de tous les
  directeurs de l'école : il n'appartient encore à aucun couple. Il sort
  de cette salle d'attente dès qu'on l'inscrit quelque part.

---

## Si quelque chose est refusé

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| Une phrase en français qui nomme la classe, la direction ou l'élève | Une règle métier. Elle dit quoi faire. |
| « row-level security policy » | Un refus de périmètre : ce rôle n'a pas le droit, ou son périmètre est vide. |

Le second cas, sur un compte qui **devrait** avoir le droit, est un
défaut — pas une fatalité. Plusieurs ont été trouvés et corrigés de cette
manière les 6, 7 et 8 août 2026. Les en-têtes de ces fichiers racontent
chacun le sien :

| Fichier | Ce qu'il raconte |
|---|---|
| `supabase/classes-direction.sql` | Un directeur ne pouvait créer aucune classe |
| `supabase/eleve-sans-classe.sql` | Un directeur ne pouvait inscrire aucun élève |
| `supabase/enseignant-auteur.sql` | Les enseignants d'une direction apparaissaient dans l'autre |
| `supabase/couple-de-directions.sql` | Le directeur français d'un couple ne voyait rien |
| `supabase/matieres-du-directeur.sql` | Le directeur ne pouvait créer aucune matière |
| `supabase/codes-parents-cloisonnes.sql` | Un directeur lisait le code parent d'un enfant hors de son périmètre |
