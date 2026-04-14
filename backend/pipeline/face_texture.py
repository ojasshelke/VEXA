import cv2
import numpy as np
import urllib.request
import mediapipe as mp
import tempfile
import os


def download_image(url: str) -> np.ndarray:
    resp = urllib.request.urlopen(url, timeout=30)
    image = np.asarray(bytearray(resp.read()), dtype="uint8")
    image = cv2.imdecode(image, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image from URL")
    return image


def extract_face_texture(photo_url: str, output_size: int = 512) -> np.ndarray:
    """
    Download photo → detect face landmarks → crop face region →
    resize to output_size × output_size texture patch.
    Returns the face texture as a numpy array (RGB, uint8).
    """
    image = download_image(photo_url)
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True
    ) as face_mesh:
        results = face_mesh.process(rgb_image)

    if not results.multi_face_landmarks:
        raise ValueError("No face detected in the photo. Please use a clear front-facing photo.")

    face_landmarks = results.multi_face_landmarks[0]
    h, w = image.shape[:2]

    # Compute bounding box from landmarks
    xs = [lm.x * w for lm in face_landmarks.landmark]
    ys = [lm.y * h for lm in face_landmarks.landmark]
    x_min, x_max = int(max(0, min(xs) - 20)), int(min(w, max(xs) + 20))
    y_min, y_max = int(max(0, min(ys) - 30)), int(min(h, max(ys) + 30))

    face_crop = rgb_image[y_min:y_max, x_min:x_max]
    if face_crop.size == 0:
        raise ValueError("Face crop region is empty — landmark detection may have failed.")

    # Resize to standard texture size
    face_texture = cv2.resize(face_crop, (output_size, output_size), interpolation=cv2.INTER_LANCZOS4)
    return face_texture
