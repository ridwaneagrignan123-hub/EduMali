# Ouvrir une école : l'ordre des choses

Ce document existe parce que trois règles de séquence ne se découvrent
qu'en butant dessus. Elles sont volontaires et toutes justifiées — mais
un directeur seul devant son écran n'a aucune raison de les deviner.

L'ordre ci-dessous a été **rejoué en base sous les vrais jetons de
chaque rôle**, le 7 août 2026, sur une école réelle vide.

---

## Qui fait quoi

| Étape | Qui | Écran |
|---|---|---|
| 1. Année scolaire | Directeur général | Année scolaire |
| 2. Matières | Directeur général | Matières |
| 3. Directions | Directeur général | Directions |
| 4. Nommer les directeurs | Directeur général | Comptes utilisateurs |
| 5. Classes | Directeur | Classes |
| 6. Enseignants | Directeur | Enseignants |
| 7. Titulaires de classe | Directeur | Classes |
| 8. Matières par classe | Directeur | Matières des classes |
| 9. Emploi du temps | Directeur | Emploi du temps |
| 10. Élèves | Directeur | Élèves |

Le **promoteur** n'écrit rien de tout cela : il consulte. C'est voulu —
il possède l'école, il ne la tient pas.

---

## Les trois règles qui surprennent

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

Au premier cycle, un seul enseignant tient la classe. Composer des
créneaux avant de savoir qui l'occupe reviendrait à bâtir un emploi du
temps sans personne dedans. Au second cycle et au lycée la règle ne
s'applique pas : chaque créneau porte son propre enseignant.

En école franco-arabe, la classe a **deux** titulaires — un par filière.

---

## Ce que le directeur ne peut pas faire, et pourquoi

Un **directeur** est cloisonné à sa direction. Il ne verra jamais les
classes ni les élèves d'une autre direction, même de la même école. Ce
n'est pas une panne :

- **Aucune direction ne lui est rattachée** → ses écrans sont vides. Le
  bandeau `AvertissementDirection` le dit. C'est au directeur général de
  le rattacher, depuis Comptes utilisateurs.
- **Le cycle de ses classes ne lui est pas demandé** : il vient de sa
  direction. Une direction du premier cycle ne peut pas contenir une
  classe de lycée.
- **Un élève pas encore placé en classe** est visible de tous les
  directeurs de l'école : il n'appartient encore à aucune direction. Il
  sort de cette salle d'attente dès qu'on l'inscrit quelque part.

---

## Si quelque chose est refusé

Les refus de la base portent un code, et deux d'entre eux se lisent
différemment :

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| Une phrase en français qui nomme la classe, la direction ou l'élève | Une règle métier. Elle dit quoi faire. |
| « row-level security policy » | Un refus de périmètre : ce rôle n'a pas le droit, ou son périmètre est vide. |

Le second cas, sur un compte qui **devrait** avoir le droit, est un
défaut — pas une fatalité. Deux ont été trouvés et corrigés le 6 et le
7 août 2026 de cette manière : voir `supabase/classes-direction.sql` et
`supabase/eleve-sans-classe.sql`, dont les en-têtes racontent l'un et
l'autre.
