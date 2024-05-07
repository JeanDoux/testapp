//---------------------------------------------Firebase initialisation-----------------------------------------------------------//
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  GeoPoint,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAp-idB0b7GF_TEYB3oQiL7Wp7DGBhZXWQ",
  authDomain: "test-fa092.firebaseapp.com",
  databaseURL:
    "https://test-fa092-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "test-fa092",
  storageBucket: "test-fa092.appspot.com",
  messagingSenderId: "437041139359",
  appId: "1:437041139359:web:b495a046a36820c9ba1caa",
  measurementId: "G-TRL68RVSFQ",
};

// Initialize Firebase
const firebase = initializeApp(firebaseConfig);
console.log("Firebase app initialized:", firebase); // Vérifiez si l'initialisation de l'application Firebase est réussie

const analytics = getAnalytics(firebase);
console.log("Firebase analytics initialized:", analytics); // Vérifiez si l'initialisation de l'analyse Firebase est réussie

const db = getFirestore(firebase);
console.log("Firebase Firestore initialized:", db); // Vérifiez si l'initialisation de Firestore est réussie

//-----------------------------// GESTION CONNEXION / AUTORISATION / TOKEN //----------------------------------------------
let code;
let accessToken;
let username;
let spotifyId;
let userLink;
let myLatitude;
let myLongitude;
let geoPoint;
let nearbyUsers;

// Code pour rediriger vers l'URL de Spotify si le code d'autorisation n'est pas déjà présent dans l'URL
window.addEventListener("DOMContentLoaded", async () => {
  console.log("Page chargée");
  if (!window.location.href.includes("code=")) {
    // Vérifie si le code d'autorisation n'est pas déjà présent dans l'URL
    window.location.href =
      "https://accounts.spotify.com/authorize?client_id=a1374b82376548cfa049d97b766d7d5c&response_type=code&redirect_uri=https://jeandoux.github.io/testapp&scope=user-read-private%20user-read-email%20user-read-currently-playing";
  }
  accessToken = sessionStorage.getItem("accessToken");
  console.log(accessToken);
  if (accessToken === "undefined" || accessToken == null) {
    console.log("Obtenir le code et échanger contre un token");
    // Si le code d'autorisation est présent dans l'URL et accessToken n'existe pas déjà, obtenir le code et échanger contre un token
    try {
      code = await getCodeFromURL();
      await exchangeCodeForToken(code);
    } catch (error) {
      console.error("Erreur lors de l'obtention du token :", error);
      return; // Sortir de la fonction en cas d'erreur
    }
  }
  // Si un accessToken est déjà présent ou a été obtenu récemment, appeler getUserProfile et les autres fonctions
  try {
    const userProfile = await getUserProfile(accessToken);
    username = userProfile.display_name;
    spotifyId = userProfile.id;
    userLink = userProfile.external_urls.spotify;
    sendUserToServer(username, spotifyId);
    updateCurrentTrack();
    // Appeler la fonction geolocation pour commencer à surveiller la position de l'utilisateur
    geolocation();
    sendUserPositionsToServer();
  } catch (error) {
    console.error("Erreur lors de la récupération du profil :", error);
  }
});

// Fonction pour extraire le code d'autorisation de l'URL de redirection
async function getCodeFromURL() {
  console.log("Extraction du code d'autorisation de l'URL de redirection");
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  console.log("Code d'autorisation extrait :", code);
  return code;
}

// Fonction pour échanger le code d'autorisation contre un access token
async function exchangeCodeForToken(code) {
  console.log("Échange du code d'autorisation contre un access token");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: "https://jeandoux.github.io/testapp",
      client_id: "a1374b82376548cfa049d97b766d7d5c",
      client_secret: "c551266bbd054acd84fed65769db2420",
    }),
  });

  const data = await response.json();
  console.log("Access token récupéré :", data.access_token);
  // Assigner l'access token à la variable accessToken
  accessToken = data.access_token;
  sessionStorage.setItem("accessToken", accessToken);
}

//---------------------//   RECUPERATION INFO PROFIL / AFFICHAGE NOM / DESACTIVER BOUTON //-----------------------------------//

// Fonction pour récupérer les informations de profil de l'utilisateur
async function getUserProfile(accessToken) {
  console.log("Récupération des informations de profil de l'utilisateur");
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  console.log("Informations de profil récupérées :", data);
  return data;
}

// Fonction pour envoyer un utilisateur au serveur avec un ID généré automatiquement par Firestore
async function sendUserToServer() {
  const usersDocRef = doc(db, "users", spotifyId);
  const data = {
    user: username,
    spotifyId: spotifyId,
    userLink: userLink,
  };

  try {
    await setDoc(usersDocRef, data);
    console.log(
      "Utilisateur ajouté ou mis à jour avec l'ID Spotify :",
      spotifyId
    );
  } catch (error) {
    console.error(
      "Erreur lors de l'ajout ou de la mise à jour de l'utilisateur :",
      error
    );
  }

  const profil = document.getElementById("profil");
  if (username !== undefined) {
    profil.textContent = `Connecté en tant que ${username}`;
  } else {
    profil.textContent = "Non connecté";
  }
}

//--------------------------// DETECTION MUSIQUE UTILISATEUR ET AFFICHAGE //---------------------------------------------//

// Fonction pour récupérer la musique actuellement en cours de lecture
async function getCurrentTrack(accessToken) {
  try {
    const response = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        "Erreur lors de la récupération de la piste actuelle : " +
          response.status
      );
    }
    // Vérifier si la réponse est vide
    if (response.status === 204) {
      console.log("Aucune lecture en cours.");
      return null; // Retourner null pour indiquer qu'aucune lecture n'est en cours
    }
    const data = await response.json();
    console.log("Piste actuelle récupérée :", data);
    return data;
  } catch (error) {
    console.error(
      "Erreur lors de la récupération de la piste actuelle :",
      error.message
    );
    throw error;
  }
}

// Fonction pour actualiser périodiquement la musique actuelle
async function updateCurrentTrack() {
  try {
    const trackData = await getCurrentTrack(accessToken);

    // Si aucune piste n'est lue ou si le trackData est null, afficher "Aucune lecture en cours"
    if (!trackData || !trackData.is_playing) {
      document.getElementById("noTrack").textContent =
        "Aucune lecture en cours";
      //effacer les données de lecture précédentes
      const trackElement = document.getElementById("title");
      const artistElement = document.getElementById("artist");
      const trackImageElement = document.getElementById("trackImage");
      const spotifyLinkElement = document.getElementById("trackLink");

      trackElement.textContent = "";
      artistElement.textContent = "";
      trackImageElement.src = "";
      spotifyLinkElement.href = "";

      const trackInfo = {
        name: null,
        artist: null,
        image: null,
        musicLink: null,
      };
      await updateDoc(doc(db, "users", spotifyId), trackInfo)
        .then(() => {
          console.log("Piste mise en pause :", trackInfo);
        })
        .catch((error) => {
          console.error("Erreur lors de la mise en pause de la piste :", error);
        });
      // Réinitialiser les valeurs de name et artist à null si le bouton switch est désactivé
    } else {
      // Si une piste est trouvée
      document.getElementById("noTrack").textContent = "";
      const trackElement = document.getElementById("title");
      const artistElement = document.getElementById("artist");
      const trackImageElement = document.getElementById("trackImage");
      const spotifyLinkElement = document.getElementById("trackLink");

      trackElement.textContent = trackData.item.name;
      artistElement.textContent = trackData.item.artists[0].name;
      trackImageElement.src = trackData.item.album.images[0].url;
      spotifyLinkElement.href = trackData.item.external_urls.spotify;
    }
    // Sélectionner l'élément input de type checkbox (le bouton de partage)
    const shareButton = document.getElementById("switch");

    // Vérifier si le bouton de partage est en position ON
    if (shareButton.checked & trackData.is_playing) {
      // Envoyer les informations sur la piste actuelle à Firestore
      const trackInfo = {
        name: trackData.item.name,
        artist: trackData.item.artists[0].name,
        image: trackData.item.album.images[0].url,
        musicLink: trackData.item.external_urls.spotify,
      };
      // Enregistrez les données dans le document
      await updateDoc(doc(db, "users", spotifyId), trackInfo)
        .then(() => {
          console.log("Piste ajoutée ou mise à jour :", trackInfo);
        })
        .catch((error) => {
          console.error(
            "Erreur lors de l'ajout ou de la mise à jour de la piste :",
            error
          );
        });
    } else {
      // Le bouton de partage est en position OFF, donc supprimez les informations sur la piste actuelle de Firestore
      const fieldsToDelete = {
        name: null,
        artist: null,
        image: null,
        musicLink: null,
        // Ajoutez d'autres champs à supprimer si nécessaire
      };
      await updateDoc(doc(db, "users", spotifyId), fieldsToDelete)
        .then(() => {
          console.log("Champs supprimés avec succès !");
        })
        .catch((error) => {
          console.error("Erreur lors de la suppression des champs :", error);
        }); // Supprimez les informations de piste de Firestore
    }
  } catch (error) {
    console.error(
      "Une erreur est survenue lors de la mise à jour de la piste actuelle :",
      error.message
    );
  }
}

// Actualisez la piste actuelle toutes les 2 secondes
setInterval(updateCurrentTrack, 2000);

//-----------------------------------------------//Envoie Géoloc et get users data proches//-------------------------------------------------//

async function sendUserPositionsToServer() {
  // Obtenez l'ID du document que vous souhaitez mettre à jour ou créer
  const documentId = spotifyId; // Remplacez VOTRE_ID_DU_DOCUMENT par l'ID du document existant ou laissez-le vide pour créer un nouveau document

  // Référence au document dans la collection "position"
  const usersDocRef = doc(db, "users", documentId);

  // Données à enregistrer dans le document
  const data = {
    geoPoint: geoPoint,
  };

  // Enregistrez les données dans le document
  try {
    await updateDoc(usersDocRef, data);
    console.log(
      "Position géographique ajoutée ou mise à jour avec ID :",
      documentId
    );
  } catch (error) {
    console.error(
      "Erreur lors de l'ajout ou de la mise à jour de la position géographique :",
      error
    );
  }

  // Une fois la position mise à jour, récupérez les données des utilisateurs à moins d'1 km de votre position
  getNearbyUsersData(myLatitude, myLongitude);
}

// Fonction pour récupérer les données d'écoute des utilisateurs à moins d'1 km de la position spécifiée
async function getNearbyUsersData(myLatitude, myLongitude) {
  try {
    const nearbyUsers = [];

    // Requête Firestore pour récupérer les utilisateurs à moins d'1 km de la position spécifiée
    const usersQuerySnapshot = await getDocs(collection(db, "users"));

    usersQuerySnapshot.forEach((doc) => {
      const userData = doc.data();
      const userLatitude = userData.geoPoint.latitude;
      const userLongitude = userData.geoPoint.longitude;

      // Calculer la distance entre la position spécifiée et la position de l'utilisateur actuel
      const distance = calculateDistance(
        myLatitude,
        myLongitude,
        userLatitude,
        userLongitude
      );

      // Si l'utilisateur est à moins d'1 km de la position spécifiée, récupérer ses données d'écoute
      if (distance < 1) {
        const usersData = {
          userId: doc.id,
          user: userData.user,
          userLink: userData.userLink,
          distance: distance,
          name: userData.name, // Ajout du champ "name"
          artist: userData.artist, // Ajout du champ "artist"
          spotifyUserId: userData.spotifyId,
          image: userData.image,
          musicLink: userData.musicLink,
        };
        nearbyUsers.push(usersData);
      }
    });

    console.log("Utilisateurs à moins d'1 km de votre position :", nearbyUsers);
    updateOthersTracks(nearbyUsers);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des données des utilisateurs :",
      error
    );
  }
}

// Fonction pour calculer la distance entre deux points géographiques en kilomètres
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en kilomètres
  const dLat = (lat2 - lat1) * (Math.PI / 180); // Conversion en radians
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance en kilomètres
  return distance;
}
// Fonction pour mettre à jour les pistes des autres utilisateurs dans l'application
function updateOthersTracks(nearbyUsers) {
  const tracksList = document.getElementById("tracksList");

  console.log(
    "Mise à jour des pistes des autres utilisateurs. Nombre d'utilisateurs à proximité :",
    nearbyUsers.length
  );

  // Parcourir chaque utilisateur à moins d'1 km
  nearbyUsers.forEach((user) => {
    // Vérifier si name, artist et spotifyUserId ne sont pas null ou undefined
    if (user.spotifyUserId) {
      // Vérifier si une div avec l'ID de l'utilisateur existe déjà
      const existingUserDiv = document.querySelector(
        `.user[data-spotify-id="${user.spotifyUserId}"]`
      );

      console.log(
        "Utilisateur :",
        user.spotifyUserId,
        " - Div existante :",
        existingUserDiv
      );

      // Si une div pour cet utilisateur existe déjà
      if (existingUserDiv) {
        // Si les données d'écoute sont null, supprimer la div existante
        if (user.name === null || user.artist === null || user.image === null) {
          console.log(
            "Suppression de la div pour l'utilisateur :",
            user.spotifyUserId
          );
          existingUserDiv.remove();
        }
        // Sinon, mettre à jour les données de la div existante
        else {
          console.log(
            "Mise à jour de la div pour l'utilisateur :",
            user.spotifyUserId
          );
          // Mettez à jour les données de la div existante avec les nouvelles informations
          existingUserDiv.querySelector("#title").textContent = user.name;
          existingUserDiv.querySelector("#artist").textContent = user.artist;
          existingUserDiv.querySelector("#trackImage").src = user.image;
          existingUserDiv.querySelector("#userLink").href = user.userLink;
          existingUserDiv.querySelector("#userLink").target = "_blank";
          existingUserDiv.querySelector("#userLink").textContent = user.user;
          existingUserDiv.querySelector("#trackLink").href = user.musicLink;
          // existingUserDiv.querySelector("#trackImage").src = user.trackImageSrc;
        }
      } else if (
        !existingUserDiv &&
        user.name !== null &&
        user.artist !== null &&
        user.image !== null
      ) {
        // Si aucune div pour cet utilisateur n'existe, créer une nouvelle div
        const userContainer = document.createElement("div");
        userContainer.classList.add("user");
        userContainer.setAttribute("data-spotify-id", user.spotifyUserId); // Ajouter l'attribut data-spotify-id

        const trackImageElement = document.createElement("img");
        trackImageElement.id = "trackImage";
        trackImageElement.src = user.image;
        trackImageElement.alt = "";

        const trackInfoContainer = document.createElement("div");
        trackInfoContainer.id = "track";

        // Ajouter le lien de la musique
        const trackLinkElement = document.createElement("a");
        trackLinkElement.id = "trackLink";
        trackLinkElement.href = user.musicLink;
        trackLinkElement.target = "_blank";

        const titleElement = document.createElement("p");
        titleElement.id = "title";
        titleElement.textContent = user.name;

        const artistElement = document.createElement("p");
        artistElement.id = "artist";
        artistElement.textContent = user.artist;

        // Ajouter les éléments au conteneur de la piste
        trackInfoContainer.appendChild(trackLinkElement);
        trackLinkElement.appendChild(titleElement);
        trackLinkElement.appendChild(artistElement);

        // Ajouter les éléments au conteneur utilisateur
        userContainer.appendChild(trackImageElement);
        userContainer.appendChild(trackInfoContainer);

        // Créer la structure pour la section "écouté par"
        const listenedByDiv = document.createElement("div");
        listenedByDiv.id = "listenedBy";

        const listenedByText = document.createElement("p");
        listenedByText.textContent = "écouté par :";

        const userLinkButton = document.createElement("a");
        userLinkButton.classList.add("userLink-button");
        userLinkButton.id = "userLink"; // Ajouter l'ID userLink
        userLinkButton.href = user.userLink;
        userLinkButton.target = "_blank";
        userLinkButton.textContent = user.user;

        listenedByDiv.appendChild(listenedByText);
        listenedByDiv.appendChild(userLinkButton);

        // Ajouter la structure pour la section "écouté par" au conteneur utilisateur
        userContainer.appendChild(listenedByDiv);
        // Ajouter le conteneur utilisateur à la liste des pistes
        tracksList.appendChild(userContainer);

        console.log(
          "Nouvelle div créée pour l'utilisateur :",
          user.spotifyUserId
        );
      }
    }
  });
}

//-----------------------------------------//GEOLOC//------------------------------------------//

// Fonction de callback pour traiter la position lorsque la position de l'utilisateur change
async function successCallback(position) {
  myLatitude = position.coords.latitude;
  myLongitude = position.coords.longitude;
  // Mettre à jour l'instance de GeoPoint avec les nouvelles valeurs de latitude et de longitude
  geoPoint = new GeoPoint(myLatitude, myLongitude);
  console.log(geoPoint);

  // Le reste du traitement de la position peut être ajouté ici
}
// Fonction de callback pour traiter les erreurs de géolocalisation
function errorCallback(error) {
  console.error("Erreur de géolocalisation :", error.message);
}
// Appeler la fonction watchPosition pour surveiller la position de l'utilisateur
function geolocation() {
  // Options pour la surveillance de la position de l'utilisateur
  const options = {
    enableHighAccuracy: true, // Activer une précision élevée si possible
    timeout: 5000, // Durée maximale (en ms) avant que la demande de position ne soit considérée comme expirée
    maximumAge: 0, // Durée maximale (en ms) pendant laquelle la position est considérée comme valide
  };
  // Vérifier si la géolocalisation est prise en charge par le navigateur
  if (navigator.geolocation) {
    // Commencer à surveiller la position de l'utilisateur
    navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      options
    );
  } else {
    console.error(
      "La géolocalisation n'est pas prise en charge par ce navigateur."
    );
  }
}

// Appeler la fonction sendUserPositionsToServer toutes les 5 secondes
setInterval(sendUserPositionsToServer, 2000);
