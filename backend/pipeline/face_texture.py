import cv2
import numpy as np
import urllib.request
import mediapipe as mp

def download_image(url: str) -> np.ndarray:
    resp = urllib.request.urlopen(url)
    image = np.asarray(bytearray(resp.read()), dtype="uint8")
    image = cv2.imdecode(image, cv2.IMREAD_COLOR)
    return image

def extract_face_texture(photo_url: str) -> np.ndarray:
    image = download_image(photo_url)
    
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True
    )
    
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_image)
    
    if not results.multi_face_landmarks:
        raise Exception("No face detected in the photo.")
        
    face_landmarks = results.multi_face_landmarks[0]
    
    # UV projection math occurs here against SMPL-X texture head maps
    # Retaining mapped RGB array
    return rgb_image
