# Le mode hors ligne

Une école malienne ne se tient pas au bout d'une fibre. L'appel se fait
debout dans une cour, les notes se saisissent dans une salle au fond d'un
bâtiment, et le réseau tombe. L'application doit continuer à servir — et
surtout, ne jamais laisser croire qu'elle a enregistré quelque chose
qu'elle n'a pas enregistré.

---

## Ce qui marche sans réseau

| Écran | Sans réseau | Ce qui se passe |
|---|---|---|
| **Présences** (`/attendance`) | ✅ | L'appel est écrit sur l'appareil, puis part tout seul au retour du réseau. |
| **Notes** (`/grades`) | ✅ | Même dispositif, en place depuis plus longtemps. |
| Tout le reste | ❌ | Écrans de consultation et de réglage : ils exigent le serveur. |

**Prévenir le parent** ne marche pas hors ligne, et le bouton le dit
lui-même au lieu de tenter et d'échouer : le message traverse une route
serveur. L'appel, lui, reste possible — c'est toute la différence.

---

## La condition, qu'il faut connaître

> **Une feuille doit avoir été ouverte AU MOINS UNE FOIS avec du réseau,
> sur cet appareil, pour être disponible sans.**

L'application met de côté la liste des élèves à chaque ouverture en
ligne. Sans cette première ouverture, elle n'a rien à afficher — et elle
le dit clairement plutôt que de montrer une classe vide.

En pratique, la consigne tient en une phrase : **ouvrez vos classes le
matin, là où ça capte.**

---

## Comment ça tient debout

**L'application s'installe.** Sur Android, « Ajouter à l'écran
d'accueil » depuis le menu du navigateur ; sur iPhone, le bouton Partager
puis « Sur l'écran d'accueil ». Un service worker (`public/sw.js`) garde
alors une coquille — `/`, `/dashboard`, `/grades`, `/attendance` — qui
s'ouvre sans réseau.

**La saisie va d'abord dans une file locale**, et seulement ensuite vers
la base. Jamais l'inverse : si l'envoi échoue, la feuille est déjà à
l'abri. On peut fermer la page, éteindre le téléphone, revenir demain.

**Le rejeu ne peut pas faire de doublon.** Les deux tables portent la
clé naturelle qu'il faut :

```
attendance ......... UNIQUE (student_id, attendance_date)
lesson_attendance .. UNIQUE (student_id, slot_id, lesson_date)
```

L'envoi passe par un `upsert` sur cette clé — le même en ligne qu'au
rattrapage. Rejouer trois fois la même feuille écrit exactement ce
qu'écrirait un seul envoi. *Vérifié en base : trois envois, une ligne,
le dernier statut.*

**Un refus et une coupure ne se traitent pas pareil.** Si la base répond
« non » (un code d'erreur PostgreSQL l'accompagne), la ligne est marquée
BLOQUÉE et n'est plus retentée toute seule — sans quoi elle relancerait
une requête vouée à l'échec à chaque reconnexion. Si c'est le réseau qui
n'a pas répondu, rien n'est marqué : ça repartira.

---

## Ce qui n'est pas traité, et pourquoi

**Pas de résolution de conflit.** Si la même présence est corrigée hors
ligne par l'enseignant et en ligne par la surveillance, c'est la dernière
synchronisation qui gagne, sans avertissement. Le traiter demanderait
d'horodater chaque ligne et de présenter les divergences à l'écran. En
pratique un appel est tenu par une seule personne — mais le cas existe,
et il ne doit pas se découvrir par surprise.

**Un élève inscrit après la mise en cache n'apparaît pas** dans la
feuille hors ligne. L'écran l'annonce quand il sert une feuille du cache.

**Le stockage local peut refuser** — mémoire pleine, navigation privée.
L'écran le dit alors franchement et demande de ne pas quitter la page
avant l'envoi, plutôt que d'annoncer un enregistrement qui n'existe pas.

---

## Comment l'essayer

1. Ouvrir `/attendance`, choisir une classe et une date **avec du
   réseau**. La feuille est mise de côté.
2. Couper le réseau (mode avion).
3. Recharger la page : elle s'ouvre, un bandeau annonce « Vous êtes hors
   ligne », la liste est là.
4. Faire l'appel, enregistrer. Le message doit dire que l'appel est
   gardé sur l'appareil.
5. Fermer complètement l'application.
6. Rétablir le réseau, rouvrir : la file part seule, le compteur
   « en attente » retombe à zéro.

**À vérifier au passage** : le compteur ne doit jamais annoncer un envoi
réussi tant que la base n'a pas confirmé.

---

## Où c'est écrit

| Fichier | Rôle |
|---|---|
| `src/lib/stockage-local.ts` | La plomberie localStorage, partagée. |
| `src/lib/attendance-offline.ts` | Cache et file de la feuille d'appel. |
| `src/lib/grades-offline.ts` | Cache et file de la saisie des notes. |
| `public/sw.js` | La coquille qui s'ouvre sans réseau. |
| `components/pwa-register.tsx` | Enregistre le service worker (production seulement). |

Le service worker n'est **pas** enregistré en développement : il
masquerait le rechargement à chaud de Next et rendrait le débogage
trompeur. Le mode hors ligne ne s'observe donc qu'en production, ou sur
un `npm run build && npm start`.
