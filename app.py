import torch
import clip
from PIL import Image
import requests
from io import BytesIO
import sqlite3
import logging
from flask import Flask, request, jsonify
from concurrent.futures import ThreadPoolExecutor
import numpy as np

# Initialize logging
logging.basicConfig(level=logging.DEBUG)

# Load the CLIP model
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

# Initialize Flask app
app = Flask(__name__)

# SQLite database setup
DATABASE = 'image_cache.db'

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cache (
                url TEXT PRIMARY KEY,
                embedding BLOB
            )
        ''')
        conn.commit()

def get_embedding_from_db(url):
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT embedding FROM cache WHERE url = ?', (url,))
        row = cursor.fetchone()
        if row:
            return torch.tensor(np.frombuffer(row[0], dtype=np.float32))  # Convert binary back to tensor
    return None

def insert_embedding_to_db(url, embedding):
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO cache (url, embedding) VALUES (?, ?)', 
                       (url, embedding.cpu().numpy().tobytes()))  # Save as binary
        conn.commit()

# Initialize the database
init_db()

# Helper function to load image from URL
def load_image_from_url(url):
    try:
        response = requests.get(url)
        response.raise_for_status()  # Check if the request was successful
        image = Image.open(BytesIO(response.content)).convert("RGB")
        return preprocess(image).unsqueeze(0).to(device)
    except Exception as e:
        logging.error(f"Error loading image from URL {url}: {e}")
    return None

# Extract CLIP embeddings for images
def extract_clip_embedding(image_tensor):
    with torch.no_grad():
        image_features = model.encode_image(image_tensor)
        return image_features / image_features.norm(dim=-1, keepdim=True)

# Process gallery image and get its embedding, with caching
def process_gallery_image(url):
    embedding = get_embedding_from_db(url)
    if embedding is not None:
        logging.debug(f"Using cached embedding for image: {url}")
        return embedding

    logging.debug(f"Processing gallery image from URL: {url}")
    image_tensor = load_image_from_url(url)
    if image_tensor is None:
        return None

    embedding = extract_clip_embedding(image_tensor)
    insert_embedding_to_db(url, embedding)  # Save to database
    return embedding

# Match reference image against gallery images
def match_images_api(reference_url, gallery_urls):
    # Load and process reference image
    reference_tensor = load_image_from_url(reference_url)
    if reference_tensor is None:
        logging.error("Error loading reference image.")
        return []

    reference_embedding = extract_clip_embedding(reference_tensor)

    # Process gallery images and extract embeddings using ThreadPoolExecutor
    with ThreadPoolExecutor() as executor:
        gallery_embeddings = list(executor.map(process_gallery_image, gallery_urls))

    # Match the reference image to each gallery image
    results = []
    for url, gallery_embedding in zip(gallery_urls, gallery_embeddings):
        if gallery_embedding is not None:
            similarity = (reference_embedding @ gallery_embedding.T).item()
            if similarity > 0.8:  # Only include results with similarity > 0.8
                results.append({"url": url, "similarity": similarity})

    # Sort the results by similarity score
    results = sorted(results, key=lambda x: x['similarity'], reverse=True)
    # Return only the URLs
    return [result['url'] for result in results]

# Flask route to handle image matching requests
@app.route('/match', methods=['POST'])
def match():
    data = request.get_json()
    reference_url = data.get("reference_url")
    gallery_urls = data.get("gallery_urls")

    if not reference_url or not gallery_urls:
        return jsonify({"error": "Missing reference_url or gallery_urls"}), 400

    try:
        urls = match_images_api(reference_url, gallery_urls)
        return jsonify(urls)  # Return the list of URLs
    except Exception as e:
        logging.error(f"Error processing request: {e}")
        return jsonify({"error": str(e)}), 500

# Main block to run the Flask app
if __name__ == '__main__':
    app.run(host="127.0.0.1", port=5959, debug=False)
