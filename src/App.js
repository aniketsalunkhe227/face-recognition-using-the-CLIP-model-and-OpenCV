import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ClipLoader } from 'react-spinners';
import Modal from './components/Modal';
import './App.css';

// Cloudinary settings
const CLOUDINARY_UPLOAD_PRESET = 'ml_default';
const CLOUDINARY_CLOUD_NAME = 'dxdgqbadq';

const App = () => {
    const [referenceUrl, setReferenceUrl] = useState('');
    const [galleryUrls, setGalleryUrls] = useState([]);
    const [matchedUrls, setMatchedUrls] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showGalleryImages, setShowGalleryImages] = useState(false);
    const [apiRequestTime, setApiRequestTime] = useState(null); // New state for API request time
    const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility
    const [modalImageUrl, setModalImageUrl] = useState(''); // State for image URL in modal

    useEffect(() => {
        // Load Cloudinary upload widget script
        const script = document.createElement('script');
        script.src = 'https://upload-widget.cloudinary.com/global/all.js';
        script.async = true;
        document.body.appendChild(script);

        // Load gallery URLs from local storage
        const storedUrls = JSON.parse(localStorage.getItem('galleryUrls')) || [];
        setGalleryUrls(storedUrls);

        const handleStorageChange = () => {
            const updatedUrls = JSON.parse(localStorage.getItem('galleryUrls')) || [];
            setGalleryUrls(updatedUrls);
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            document.body.removeChild(script);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const isValidUrl = (url) => {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    };

    const openCloudinaryWidget = (type) => {
        window.cloudinary.openUploadWidget({
            cloudName: CLOUDINARY_CLOUD_NAME,
            uploadPreset: CLOUDINARY_UPLOAD_PRESET,
            sources: ['local', 'url', 'camera'],
            multiple: type === 'gallery',
            maxFiles: type === 'reference' ? 1 : 10,
        }, (error, result) => {
            if (!error && result && result.event === "success") {
                const imageUrl = result.info.secure_url;
                if (!isValidUrl(imageUrl)) {
                    setError('Invalid image URL.');
                    return;
                }

                if (type === 'reference') {
                    setReferenceUrl(imageUrl);
                } else {
                    setGalleryUrls(prevUrls => {
                        const updatedUrls = [...prevUrls, imageUrl];
                        localStorage.setItem('galleryUrls', JSON.stringify(updatedUrls));
                        return updatedUrls;
                    });
                }
            }
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!referenceUrl && galleryUrls.length === 0) {
            setError('Please provide both reference URL and gallery URLs.');
            return;
        }

        setError('');
        setLoading(true);
        const startTime = performance.now(); // Start time

        try {
            const response = await axios.post('http://3.108.58.208:5959/match', {
                reference_url: referenceUrl,
                gallery_urls: galleryUrls
            });
            const data = response.data;
            setMatchedUrls(data);
            if (data.length === 0) {
                setError('No images matched.');
            }
        } catch (error) {
            setError('An error occurred while matching images.');
            console.error(error);
        } finally {
            const endTime = performance.now(); // End time
            setApiRequestTime((endTime - startTime).toFixed(2)); // Set API request time
            setLoading(false);
        }
    };

    const handleDownloadAll = () => {
        matchedUrls.forEach((url, index) => {
            const link = document.createElement('a');
            link.href = url;
            link.download = `matched-image-${index + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };

    const toggleShowGalleryImages = () => {
        setShowGalleryImages(prevState => !prevState);
    };

    const openImagePreview = (url) => {
        setModalImageUrl(url);
        setIsModalOpen(true);
    };

    const closeImagePreview = () => {
        setIsModalOpen(false);
        setModalImageUrl('');
    };

    return (
        <div className="image-matcher">
            <h1>Image Matcher API</h1>
            <div className="upload-section">
                <div className="upload-container">
                    <h2>Profile Image</h2>
                    <button className="upload-btn" onClick={() => openCloudinaryWidget('reference')}>
                        Upload Reference Image
                    </button>
                    {referenceUrl && (
                        <div className="image-preview" onClick={() => openImagePreview(referenceUrl)}>
                            <img src={referenceUrl} alt="Reference" />
                        </div>
                    )}
                </div>
                <div className="upload-container">
                    <h2>Gallery Images</h2>
                    <button className="upload-btn" onClick={() => openCloudinaryWidget('gallery')}>
                        Upload Gallery Images
                    </button>
                    <p>{galleryUrls.length} images uploaded</p>
                    <button className="show-gallery-btn" onClick={toggleShowGalleryImages}>
                        {showGalleryImages ? 'Hide Gallery Images' : 'Show Gallery Images'}
                    </button>
                </div>
            </div>
            {showGalleryImages && (
                <div className="results-section">
                    <h2>Gallery Images</h2>
                    <div className="image-gallery">
                        {galleryUrls.map((url, index) => (
                            <div key={index} className="image-item" onClick={() => openImagePreview(url)}>
                                <img src={url} alt={`Gallery ${index + 1}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="match-section">
                <button className="match-btn" onClick={handleSubmit}>Match Images</button>
                {apiRequestTime && <div className="api-time">Api Request Tooks only: {apiRequestTime} ms 🤩</div>} {/* New div for time */}
            </div>
            {loading && (
                <div className="loader">
                    <ClipLoader size={50} color={"#000000"} loading={loading} />
                </div>
            )}
            {error && <p className="error">{error}</p>}
            {matchedUrls.length > 0 && (
                <div className="results-section">
                    <h2>Matched Images</h2>
                    <button className="download-btn" onClick={handleDownloadAll}>Download All Images</button>
                    <div className="image-gallery">
                        {matchedUrls.map((url, index) => (
                            <div key={index} className="image-item" onClick={() => openImagePreview(url)}>
                                <img src={url} alt={`Matched ${index + 1}`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {matchedUrls.length === 0 && !loading && !error && (
                <p>No images matched.</p>
            )}
            <Modal show={isModalOpen} onClose={closeImagePreview} imageUrl={modalImageUrl} />
        </div>
    );
};

export default App;
