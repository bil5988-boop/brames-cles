# Contrôles VGP – version serveur avec comptes

Application web (charges d'essai et clés de levage) avec comptes, rôles imposés côté serveur, photos et rapports PDF.
Aucune installation de paquet : il suffit de **Node.js 18 ou plus** sur un poste ou un serveur de l'intranet.

## Démarrer
- Windows : double-clic sur `demarrer.bat` — Linux/Mac : `./demarrer.sh` (ou `node server.js`).
- Ouvrir `http://<adresse-du-serveur>:3000` (port modifiable : variable `PORT`).
- Au **premier démarrage**, le compte `admin` est créé et son mot de passe provisoire s'affiche dans la console.
  Il faut le changer dès la première connexion. Il n'est affiché qu'une fois.

## Rôles (contrôlés par le serveur, pas seulement masqués à l'écran)
| | Contrôle | Gestionnaire | Admin |
|---|---|---|---|
| Voir matériels, rapports, PDF, export CSV | oui | oui | oui |
| Faire un contrôle (date, résultat, commentaire, photos) | oui | oui | oui |
| Modifier / supprimer un contrôle | non | oui | oui |
| Modifier, ajouter, supprimer un matériel | non | oui | oui |
| Créer les comptes, rôles, mots de passe | non | non | oui |

Le nom du contrôleur est celui du compte connecté (non modifiable) : traçabilité du « qui a contrôlé ».

## Contrôles, photos et rapports (v2)
- **Chaque contrôle a un n° de rapport unique** `CR-AAAA-NNNNNNNNN` (année en cours + compteur à 9 chiffres), attribué à l'enregistrement et jamais réutilisé. Il figure dans la liste, l'export CSV et le PDF (un PDF par contrôle).
- **Photo principale** (1 max), **photos complémentaires** (4 max), **photos d'anomalies** (4 max, propres au rapport).
  Si la fiche du matériel n'a pas de photo, la photo principale / les complémentaires y sont enregistrées automatiquement.
  Si la fiche en a déjà, elles sont reprises dans le rapport tant que la case « Je souhaite garder la photo actuelle » est cochée ; en la décochant on prend de nouvelles photos qui remplacent celles de la fiche.
- Photo principale obligatoire sauf résultat « Non vu ».
- PDF : texte « Le matériel est **CONFORME** … peut rester à la disposition des utilisateurs » (vert) ou « **NON CONFORME** … ne doit pas être mis à disposition » (orange).
- Logo : `public/logo.png` (recadré depuis la maquette) ; remplacez-le par un fichier de meilleure qualité si vous en avez un.
- Au premier démarrage de cette version, les contrôles existants reçoivent un n° (par ordre chronologique) et leurs anciennes photos sont rangées : 1re en principale, les suivantes en complémentaires.
  **Sauvegardez `data/` avant de mettre à jour.**
- Le fichier `index.html` va dans le dossier `public/`.

## Suppression, comptes et trame PDF (v5)
- **Contrôle non conforme** : au moins une photo d'anomalie est obligatoire (vérifié aussi par le serveur).
- **Demande de suppression** : tout utilisateur peut, depuis le rapport (clic sur l'année), demander la suppression d'un contrôle (motif facultatif). L'année passe en jaune et la tuile « demandes de suppression » de la page d'accueil compte les demandes en attente ; un clic sur la tuile liste les rapports concernés. Seuls un gestionnaire ou un admin peuvent supprimer le rapport ou refuser la demande ; l'auteur de la demande peut l'annuler.
- **Admin / Utilisateurs** : bouton « Modifier » pour changer le nom affiché et l'identifiant (la connexion en cours reste valide ; l'historique des contrôles suit le nouveau nom).
- **Admin / Trame PDF** : modification des textes de l'en-tête, du bandeau, des phrases Conforme / Non conforme (`**mot**` = gras), du pied de page, des 3 couleurs et du logo (PNG, 2 Mo max), avec aperçu PDF avant enregistrement. Réglages stockés dans `data/db.json`, logo dans `data/logo.png`. La mise en page (position et ordre des sections) reste fixe.

## Droits modulables, rapport sur 1 page, liste allégée (v6)
- **Droits par utilisateur** (Admin → Utilisateurs → bouton « Droits ») : chaque compte a par défaut les droits de son rôle, et l'admin peut en accorder ou retirer
  parmi : faire des contrôles · modifier les contrôles/rapports · supprimer les contrôles (et traiter les demandes de suppression) · modifier les fiches matériel · ajouter des matériels · supprimer des matériels.
  Contrôlé par le serveur. « Rôle par défaut » rétablit les droits standards ; changer le rôle d'un compte les rétablit aussi. Un admin a toujours tous les droits ; la gestion des comptes et la trame PDF restent réservées aux admins.
  Un utilisateur sans le droit de suppression voit « Demander la suppression » ; sans le droit « faire des contrôles », il n'a plus le bouton « Contrôler ».
- **Rapport PDF : toujours 1 seule page.** La mise en page s'adapte : photos complémentaires/anomalies réduites si besoin, commentaire en police plus petite puis tronqué par « … » s'il dépasse la place disponible.
  Le champ commentaire est limité à 1 200 caractères pour cette raison.
- **Tuile « non conformes »** : un clic liste les matériels dont le dernier contrôle est non conforme, avec accès direct au rapport, au PDF et à la fiche.
- **Liste du matériel : 10 années au maximum** = année en cours + 2 suivantes + années précédentes dans la limite de 10, jamais avant 2022 (en 2026 : 2022 à 2028 ; en 2029 : 2022 à 2031 ; en 2030 : 2023 à 2032…).
  **Fiche détaillée** (clic sur le matériel) : toutes les années depuis 2022 et la liste de tous les rapports émis (voir / PDF).
- **Affichage téléphone allégé** (même application, mise en page adaptée) : menu ☰, filtres repliés, tuiles défilantes, cartes compactes sans miniature ni lieu de stockage. Sur PC : miniature de la fiche et plus de détails.
- Mise à jour : remplacer `server.js` et `public/index.html`, **sauvegarder `data/` avant**, redémarrer. Aucune migration manuelle.

## Journal, catégories modifiables, années compactes (v7)
- **Journal des modifications (admins uniquement)** : chaque action est enregistrée avec l'auteur, la date et le détail (« Résultat : Conforme → Non conforme », « Masse : 400 → 416 », droits accordés/retirés, comptes créés/modifiés/supprimés, catégories, trame PDF…). Les mots de passe n'y figurent jamais.
  Consultable dans le menu **Journal** (filtres par type, recherche) et, pour chaque matériel, tout en bas de la **fiche détaillée**. Les non-admins ne le voient pas et le serveur leur refuse l'accès.
  Au premier démarrage de cette version, un historique de départ est reconstitué à partir des données existantes (création et dernière modification de chaque contrôle/fiche) ; il est signalé « historique reconstitué ». Conservation : les 20 000 dernières entrées. Le journal est stocké dans `data/db.json`.
- **Catégories d'utilisateurs renommables** : menu **Catégories & droits** (admin). Les noms (Contrôle, Gestionnaire, Admin par défaut) s'affichent partout (en-tête, liste des comptes, création d'un compte). Deux catégories ne peuvent pas porter le même nom.
- **Droits par catégorie** (même écran, tableau droits × catégories) : les droits cochés s'appliquent à tous les comptes de la catégorie. Un compte dont l'admin a personnalisé les droits (bouton « Droits » de l'utilisateur) garde les siens. La catégorie Admin a toujours tous les droits (non modifiable) pour éviter tout verrouillage. « Valeurs par défaut » rétablit noms et droits des catégories.
- **Années plus compactes** dans la liste : puces d'environ la moitié de la hauteur (≈ 20 px au lieu de ≈ 42 px sur PC, 26 px sur téléphone), cartes plus courtes.
- Mise à jour : remplacer `server.js` et `public/index.html`, **sauvegarder `data/` avant**, redémarrer. Aucune migration manuelle.

## Sécurité – à faire / à savoir
- **HTTPS obligatoire en usage réel** : les mots de passe circulent sinon en clair. Placez un reverse proxy (nginx, IIS, Apache…)
  devant le serveur avec un certificat, puis démarrez avec la variable `SECURE=1` (cookie « Secure »).
- Mots de passe stockés hachés (scrypt), 10 caractères minimum, verrouillage temporaire après 5 échecs, sessions de 12 h.
- Photos accessibles uniquement aux personnes connectées.
- Les sessions sont perdues au redémarrage du serveur (reconnexion demandée).

## Données et sauvegarde
Tout est dans le dossier `data/` (`db.json` + `photos/`). **Sauvegardez ce dossier régulièrement** (serveur arrêté ou copie simple).
Le catalogue initial (226 matériels) vient de `seed.json`, utilisé seulement au premier démarrage.

## Export PDF hors Internet
Le PDF utilise la bibliothèque jsPDF. Sur un intranet sans accès Internet, téléchargez une fois
`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` et placez le fichier dans `public/` (nom inchangé).

## Limites connues
Pas de journal d'audit consultable, pas de réinitialisation de mot de passe par e-mail (l'admin en définit un provisoire),
un seul serveur (pas de haute disponibilité), pas de mode hors ligne sur téléphone.
