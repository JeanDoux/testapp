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

// Code pour rediriger vers l'URL de Spotify si le code d'autorisation n'est pas déjà présent dans l'URL
window.addEventListener("DOMContentLoaded", async () => {
  console.log("Page chargée");
  if (!window.location.href.includes("code=")) {
    // Vérifie si le code d'autorisation n'est pas déjà présent dans l'URL
    window.location.href =
      "https://accounts.spotify.com/authorize?client_id=adcf0a72b3c945d79fd63784ff471227&response_type=code&redirect_uri=http://https://jeandoux.github.io/testapp/&scope=user-read-private%20user-read-email%20user-read-currently-playing";
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
    // Démarrer la mise à jour périodique des utilisateurs à proximité
    startNearbyUsersUpdate();
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
      redirect_uri: "http://127.0.0.1:5500/index.html",
      client_id: "adcf0a72b3c945d79fd63784ff471227",
      client_secret: "ea8c7bc86f2642d18e799e0ec9a0f8b2",
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
    console.log("ECRITURE setDoc:", spotifyId);
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

let currentTrack = null; // Variable pour stocker la piste actuelle

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
      document.getElementById("noTrack").textContent =
        "Aucune lecture en cours";
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

// Fonction pour extraire les informations pertinentes de la piste
function getTrackInfo(trackData) {
  if (!trackData || !trackData.item) return null;
  return {
    name: trackData.item.name,
    artist: trackData.item.artists[0].name,
    image: trackData.item.album.images[0].url,
    musicLink: trackData.item.external_urls.spotify,
    is_playing: trackData.is_playing,
  };
}

// Fonction pour mettre à jour le DOM avec les informations de la piste
function updateDOM(trackInfo) {
  document.getElementById("noTrack").textContent = "";
  document.getElementById("title").textContent = trackInfo.name;
  document.getElementById("artist").textContent = trackInfo.artist;
  document.getElementById("trackImage").src = trackInfo.image;
  document.getElementById("trackLink").href = trackInfo.musicLink;
  console.log("DOM updated");
}

// Fonction pour vider le DOM
function clearDOM() {
  document.getElementById("noTrack").textContent = "Aucune lecture en cours";
  document.getElementById("title").textContent = "";
  document.getElementById("artist").textContent = "";
  document.getElementById("trackImage").src = "";
  document.getElementById("trackLink").href = "";
  console.log("DOM cleared");
}

// Fonction pour mettre à jour Firestore avec les informations de la piste
async function updateFirestore(trackInfo) {
  const { name, artist, image, musicLink } = trackInfo;
  const fieldsToUpdate = {
    name,
    artist,
    image,
    musicLink,
  };
  await updateDoc(doc(db, "users", spotifyId), fieldsToUpdate)
    .then(() => {
      console.log("ECRITURE : Piste ajoutée ou mise à jour :", trackInfo);
    })
    .catch((error) => {
      console.error(
        "Erreur lors de l'ajout ou de la mise à jour de la piste :",
        error
      );
    });
}

// Fonction pour vider les champs Firestore
async function clearFirestore() {
  const fieldsToDelete = {
    name: null,
    artist: null,
    image: null,
    musicLink: null,
  };
  await updateDoc(doc(db, "users", spotifyId), fieldsToDelete)
    .then(() => {
      console.log("ECRITURE : Champs supprimés avec succès !");
    })
    .catch((error) => {
      console.error("Erreur lors de la suppression des champs :", error);
    });
}

// Fonction pour actualiser périodiquement la musique actuelle
async function updateCurrentTrack() {
  try {
    const trackData = await getCurrentTrack(accessToken);
    const newTrackInfo = getTrackInfo(trackData);
    const shareButton = document.getElementById("switch");
    // Vérifier si la piste actuelle est différente de la piste précédente
    if (JSON.stringify(currentTrack) !== JSON.stringify(newTrackInfo)) {
      // Mettre à jour la piste actuelle
      currentTrack = newTrackInfo;

      // Si aucune piste n'est lue ou si le trackData est null, afficher "Aucune lecture en cours"
      if (!trackData || !trackData.is_playing) {
        clearDOM();
        if (shareButton.checked) {
          await clearFirestore();
        }
      } else {
        // Si une piste est trouvée et en cours de lecture
        updateDOM(newTrackInfo);
        if (shareButton.checked) {
          await updateFirestore(newTrackInfo);
        }
      }
    } else {
      console.log(
        "La piste est la même que précédemment. Aucune mise à jour nécessaire."
      );
      // Gérer les changements d'état du bouton de partage
      const wasShareButtonChecked =
        shareButton.getAttribute("data-checked") === "true";
      const isShareButtonChecked = shareButton.checked;

      if (
        isShareButtonChecked &&
        !wasShareButtonChecked &&
        trackData.is_playing
      ) {
        // Si le bouton est maintenant checked mais n'était pas checked avant
        await updateFirestore(newTrackInfo);
        shareButton.setAttribute("data-checked", "true");
      } else if (!isShareButtonChecked && wasShareButtonChecked) {
        // Si le bouton est maintenant unchecked mais était checked avant
        await clearFirestore();
        shareButton.setAttribute("data-checked", "false");
      }
    }
  } catch (error) {
    console.error(
      "Une erreur est survenue lors de la mise à jour de la piste actuelle :",
      error.message
    );
  }
}

// Actualisez la piste actuelle toutes les 2 secondes
setInterval(updateCurrentTrack, 5000);

//-----------------------------------------------//Envoie Géoloc et get users data proches//-------------------------------------------------//

// Variable pour stocker la dernière position envoyée au serveur
let lastSentPosition = null;

// Fonction pour envoyer les positions utilisateur au serveur
async function sendUserPositionsToServer() {
  // Vérifier si la dernière position envoyée est différente de la nouvelle position
  if (
    lastSentPosition !== null &&
    lastSentPosition.latitude === myLatitude &&
    lastSentPosition.longitude === myLongitude
  ) {
    // Si la position n'a pas changé, quitter la fonction
    return;
  }

  // Obtenez l'ID du document que vous souhaitez mettre à jour ou créer
  const documentId = spotifyId; // Assurez-vous que `spotifyId` est défini et accessible

  // Référence au document dans la collection "users"
  const usersDocRef = doc(db, "users", documentId);

  // Données à enregistrer dans le document
  const data = {
    latitude: myLatitude,
    longitude: myLongitude,
  };

  // Enregistrez les données dans le document
  try {
    await updateDoc(usersDocRef, data);
    console.log(
      "ECRITURE : Position géographique ajoutée ou mise à jour avec ID :",
      documentId
    );
    // Mettre à jour la dernière position envoyée
    lastSentPosition = { latitude: myLatitude, longitude: myLongitude };
  } catch (error) {
    console.error(
      "Erreur lors de l'ajout ou de la mise à jour de la position géographique :",
      error
    );
  }
}

let searchRadius = 1; // Par défaut 1 km

function getSelectedRadius() {
  const selectedOption = document.querySelector('input[name="btn"]:checked');
  return parseInt(selectedOption.value);
}

document.querySelectorAll('input[name="btn"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    searchRadius = getSelectedRadius();
    console.log("Nouveau rayon de recherche :", searchRadius);
  });
});

async function getNearbyUsersData(myLatitude, myLongitude) {
  try {
    const nearbyUsers = [];

    // Créer une référence à la collection des utilisateurs
    const usersCollectionRef = collection(db, "users");

    // Définir le rayon de recherche en mètres
    const radiusInMeters = searchRadius * 1000; // Convertir km en mètres

    // Convertir le rayon de recherche en degrés de latitude et de longitude
    const radiusInDegreesLat = radiusInMeters / 111000; // Environ 111 km par degré de latitude
    const radiusInDegreesLon =
      radiusInMeters / (111000 * Math.cos((myLatitude * Math.PI) / 180)); // Ajustement pour la longitude

    // Créer une requête pour rechercher les utilisateurs à proximité
    const nearbyUsersQuery = query(
      usersCollectionRef,
      where("latitude", ">", myLatitude - radiusInDegreesLat),
      where("latitude", "<", myLatitude + radiusInDegreesLat),
      where("longitude", ">", myLongitude - radiusInDegreesLon),
      where("longitude", "<", myLongitude + radiusInDegreesLon)
    );

    // Exécuter la requête
    const querySnapshot = await getDocs(nearbyUsersQuery);

    // Traiter les résultats de la requête
    querySnapshot.forEach((doc) => {
      const userData = doc.data();

      // Ajouter les données de l'utilisateur à la liste des utilisateurs à proximité
      nearbyUsers.push({
        userId: doc.id,
        user: userData.user,
        userLink: userData.userLink,
        name: userData.name,
        artist: userData.artist,
        spotifyUserId: userData.spotifyId,
        image: userData.image,
        musicLink: userData.musicLink,
      });
    });

    console.log(
      `LECTURE : Utilisateurs à moins de ${searchRadius} km de votre position :`,
      nearbyUsers
    );
    updateOthersTracks(nearbyUsers);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des données des utilisateurs :",
      error
    );
  }
}

function startNearbyUsersUpdate() {
  // Appeler les fonctions getNearbyUsersData et updateOthersTracks toutes les 5 secondes
  setInterval(async () => {
    if (
      myLatitude !== undefined &&
      myLongitude !== undefined &&
      myLatitude !== null &&
      myLongitude !== null
    ) {
      try {
        await getNearbyUsersData(myLatitude, myLongitude);
      } catch (error) {
        console.error(
          "Erreur lors de la mise à jour des utilisateurs à proximité :",
          error
        );
      }
    } else {
      console.error("Latitude et longitude doivent être définies.");
    }
  }, 5000);
}

// Initialisation du rayon de recherche
searchRadius = getSelectedRadius();

async function updateOthersTracks(nearbyUsers) {
  const tracksList = document.getElementById("tracksList");

  console.log(
    "Mise à jour des pistes des autres utilisateurs. Nombre d'utilisateurs à proximité :",
    nearbyUsers.length
  );

  const fragment = document.createDocumentFragment();

  // Utiliser une Map pour suivre les éléments existants
  const existingElements = new Map();
  document.querySelectorAll(".user[data-spotify-id]").forEach((el) => {
    existingElements.set(el.getAttribute("data-spotify-id"), el);
  });

  // Créer un Set pour suivre les utilisateurs actuellement détectés
  const currentUserIds = new Set();

  nearbyUsers.forEach((user) => {
    if (user.spotifyUserId) {
      currentUserIds.add(user.spotifyUserId);
      const existingUserDiv = existingElements.get(user.spotifyUserId);

      if (existingUserDiv) {
        if (user.name === null || user.artist === null || user.image === null) {
          console.log(
            "Suppression de la div pour l'utilisateur :",
            user.spotifyUserId
          );
          existingUserDiv.remove();
          existingElements.delete(user.spotifyUserId);
        } else {
          console.log(
            "Mise à jour de la div pour l'utilisateur :",
            user.spotifyUserId
          );
          existingUserDiv.querySelector("#title").textContent = user.name;
          existingUserDiv.querySelector("#artist").textContent = user.artist;
          existingUserDiv.querySelector("#trackImage").src = user.image;
          existingUserDiv.querySelector("#userLink").href = user.userLink;
          existingUserDiv.querySelector("#userLink").textContent = user.user;
          existingUserDiv.querySelector("#trackLink").href = user.musicLink;
        }
      } else if (
        user.name !== null &&
        user.name !== undefined &&
        user.artist !== null &&
        user.artist !== undefined &&
        user.image !== null &&
        user.image !== undefined
      ) {
        const userContainer = document.createElement("div");
        userContainer.classList.add("user");
        userContainer.setAttribute("data-spotify-id", user.spotifyUserId);

        const trackImageElement = document.createElement("img");
        trackImageElement.id = "trackImage";
        trackImageElement.src = user.image;
        trackImageElement.alt = "";

        const trackInfoContainer = document.createElement("div");
        trackInfoContainer.id = "track";

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

        trackInfoContainer.appendChild(trackLinkElement);
        trackLinkElement.appendChild(titleElement);
        trackLinkElement.appendChild(artistElement);

        userContainer.appendChild(trackImageElement);
        userContainer.appendChild(trackInfoContainer);

        const listenedByDiv = document.createElement("div");
        listenedByDiv.id = "listenedBy";

        const listenedByText = document.createElement("p");
        listenedByText.textContent = "écouté par :";

        const userLinkButton = document.createElement("a");
        userLinkButton.classList.add("userLink-button");
        userLinkButton.id = "userLink";
        userLinkButton.href = user.userLink;
        userLinkButton.target = "_blank";
        userLinkButton.textContent = user.user;

        listenedByDiv.appendChild(listenedByText);
        listenedByDiv.appendChild(userLinkButton);

        userContainer.appendChild(listenedByDiv);

        fragment.appendChild(userContainer);

        console.log(
          "Nouvelle div créée pour l'utilisateur :",
          user.spotifyUserId
        );
      }
    }
  });

  // Supprimer les divs des utilisateurs qui ne sont plus détectés
  existingElements.forEach((element, spotifyUserId) => {
    if (!currentUserIds.has(spotifyUserId)) {
      console.log("Suppression de la div pour l'utilisateur : ", spotifyUserId);
      element.remove();
    }
  });

  tracksList.appendChild(fragment);
}

//-----------------------------------------//GEOLOC//------------------------------------------//

// Fonction de callback pour traiter la position lorsque la position de l'utilisateur change
async function successCallback(position) {
  myLatitude = position.coords.latitude;
  myLongitude = position.coords.longitude;

  console.log("Latitude:", myLatitude, "Longitude:", myLongitude);

  // Appeler la fonction pour envoyer les positions utilisateur au serveur
  await sendUserPositionsToServer();
}

// Fonction de callback pour traiter les erreurs de géolocalisation
function errorCallback(error) {
  console.error("Erreur de géolocalisation :", error.message);
}

// Fonction pour obtenir immédiatement la position actuelle
function getCurrentPosition() {
  // Options pour la demande de position de l'utilisateur
  const options = {
    enableHighAccuracy: true, // Activer une précision élevée si possible
    timeout: 5000, // Durée maximale (en ms) avant que la demande de position ne soit considérée comme expirée
    maximumAge: 0, // Durée maximale (en ms) pendant laquelle la position est considérée comme valide
  };

  // Vérifier si la géolocalisation est prise en charge par le navigateur
  if (navigator.geolocation) {
    // Obtenir immédiatement la position actuelle de l'utilisateur
    navigator.geolocation.getCurrentPosition(
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

// Appeler la fonction watchPosition pour surveiller la position de l'utilisateur
function watchPosition() {
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

// Fonction pour initialiser la géolocalisation
function geolocation() {
  // Obtenir immédiatement la position actuelle
  getCurrentPosition();
  // Commencer à surveiller la position de l'utilisateur
  watchPosition();
}
