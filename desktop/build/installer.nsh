; Ajoute « Envoyer vers → SpeedPost » dans le clic droit de l'Explorateur Windows
!macro customInstall
  CreateShortCut "$SENDTO\SpeedPost.lnk" "$INSTDIR\SpeedPost.exe" "" "$INSTDIR\SpeedPost.exe" 0
!macroend
!macro customUnInstall
  Delete "$SENDTO\SpeedPost.lnk"
!macroend
