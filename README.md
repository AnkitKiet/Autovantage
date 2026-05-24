# AutoVantage

AutoVantage is a full-stack, AI-driven application featuring predictive machine learning models integrated directly into a robust Java Spring Boot backend, with a modern Next.js frontend. 

The project architecture is divided into three distinct modules:
1. **Frontend**: A responsive and modern user interface.
2. **Backend**: A robust REST API server that runs machine learning models natively.
3. **Machine Learning**: Python-based model training and export pipeline.

---

## 🏗️ Architecture & Tech Stack

### 1. Frontend (`/frontend`)
The frontend is a modern web application built with **Next.js** (App Router) and **React**.
- **Styling**: Tailwind CSS for highly customizable, utility-first design.
- **Authentication**: Custom authentication hooks and cookie-based sessions (`useAuth`).
- **Key Features**: Login dashboard with responsive gradient UI, protected routes, and interactive components.

### 2. Backend (`/backend`)
The backend is built with **Java** and **Spring Boot**. 
- **Inference Engine**: Uses `onnxruntime` (Microsoft ONNX Runtime) to execute Machine Learning models natively inside the JVM.
- **Zero Python Dependency**: Because models are exported to ONNX, the Spring Boot application does not require a Python environment or scikit-learn at runtime.
- **APIs**: Exposes REST endpoints for the frontend to consume predictive insights (ranking and strategy).

### 3. Machine Learning (`/machine-learning`)
The ML pipeline is responsible for training, scaling, and exporting predictive models.
- **Models**:
  - **Ranking Model**: Trained using **XGBoost** (Predicts scores to rank feeds).
  - **Strategy Model**: Trained using **CatBoost** (Multi-class classification for promotion levels and probabilities).
- **Data Processing**: `scikit-learn` `StandardScaler` for numeric feature scaling.
- **Model Export**: Uses `skl2onnx` and `onnxmltools` to generate `.onnx` files, bridging the gap between Python training and Java inference.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+ recommended)
- **Java** (JDK 17+ recommended)
- **Maven** (for Backend)
- **Python** (3.9+ recommended)

---

### Step 1: Machine Learning (Model Export)
Before running the backend, you need to generate the ONNX model files.

1. Navigate to the ML directory:
   ```bash
   cd machine-learning
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   # (Make sure xgboost, catboost, onnx, onnxruntime, onnxmltools, and skl2onnx are installed)
   ```
3. Run the export script:
   ```bash
   python export_onnx.py
   ```
4. The script will train/validate the models and output 5 files into the `onnx/` directory:
   - `ranking_model.onnx`
   - `strategy_model.onnx`
   - `scaler_a.onnx`
   - `scaler_b.onnx`
   - `onnx_manifest.json`

---

### Step 2: Backend (Spring Boot)
The backend requires the ONNX models generated in Step 1 to serve predictions.

1. Copy the generated ONNX files from the ML folder to the backend's resources:
   ```bash
   # Copy from machine-learning/onnx/ -> backend/src/main/resources/models/
   ```
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Build the application using Maven:
   ```bash
   mvn clean install
   ```
4. Run the Spring Boot server:
   ```bash
   mvn spring-boot:run
   ```
   *The backend will typically start on `http://localhost:8080`.*

---

### Step 3: Frontend (Next.js)
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and go to `http://localhost:3000/login`.

---

## 🛡️ License

This project is proprietary.
