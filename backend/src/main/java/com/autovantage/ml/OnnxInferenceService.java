package com.autovantage.ml;

import ai.onnxruntime.*;
import com.autovantage.domain.CarListing;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;
import java.util.Map;

@Service
public class OnnxInferenceService {

    private OrtEnvironment env;
    private OrtSession rankingSession;
    private OrtSession strategySession;
    private OrtSession scalerASession;
    private OrtSession scalerBSession;

    @PostConstruct
    public void init() throws OrtException {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        
        rankingSession = env.createSession(loadResource("/models/ranking_model.onnx"), options);
        strategySession = env.createSession(loadResource("/models/strategy_model.onnx"), options);
        scalerASession = env.createSession(loadResource("/models/scaler_a.onnx"), options);
        scalerBSession = env.createSession(loadResource("/models/scaler_b.onnx"), options);
    }

    public float predictMlScore(CarListing listing) throws OrtException {
        float[] features = FeatureVector.forModelA(listing);
        
        float[] numericBlock = new float[11];
        System.arraycopy(features, 0, numericBlock, 0, 11);
        
        float[] scaledNumeric = scaleNumericBlock(scalerASession, numericBlock);
        System.arraycopy(scaledNumeric, 0, features, 0, 11);
        
        float[][] input2D = new float[][]{features};
        try (OnnxTensor tensor = OnnxTensor.createTensor(env, input2D);
             OrtSession.Result result = rankingSession.run(Map.of("float_input", tensor))) {
            float[][] output = (float[][]) result.get(0).getValue();
            return output[0][0];
        }
    }

    public PromotionResult predictPromotion(CarListing listing) throws OrtException {
        float[] features = FeatureVector.forModelB(listing);
        
        float[] numericBlock = new float[9];
        System.arraycopy(features, 0, numericBlock, 0, 9);
        
        float[] scaledNumeric = scaleNumericBlock(scalerBSession, numericBlock);
        System.arraycopy(scaledNumeric, 0, features, 0, 9);
        
        float[][] input2D = new float[][]{features};
        try (OnnxTensor tensor = OnnxTensor.createTensor(env, input2D);
             OrtSession.Result result = strategySession.run(Map.of("features", tensor))) {
            
            Object labelObj = result.get(0).getValue();
            long label = 0;
            if (labelObj instanceof long[]) {
                label = ((long[]) labelObj)[0];
            } else if (labelObj instanceof long[][]) {
                label = ((long[][]) labelObj)[0][0];
            }

            float confidence = 0.0f;
            if (result.size() > 1) {
                Object probObj = result.get(1).getValue();
                if (probObj instanceof List) {
                    List<?> probasList = (List<?>) probObj;
                    if (!probasList.isEmpty()) {
                        Object firstElement = probasList.get(0);
                        if (firstElement instanceof Map) {
                            @SuppressWarnings("unchecked")
                            Map<Long, Float> map = (Map<Long, Float>) firstElement;
                            confidence = map.getOrDefault(label, 0.0f);
                        } else if (firstElement instanceof OnnxMap) {
                            @SuppressWarnings("unchecked")
                            Map<Long, Float> map = (Map<Long, Float>) ((OnnxMap) firstElement).getValue();
                            confidence = map.getOrDefault(label, 0.0f);
                        }
                    }
                } else if (probObj instanceof Map[]) {
                    @SuppressWarnings("unchecked")
                    Map<Long, Float>[] probas = (Map<Long, Float>[]) probObj;
                    confidence = probas[0].getOrDefault(label, 0.0f);
                } else if (probObj instanceof OnnxMap[]) {
                    OnnxMap[] probas = (OnnxMap[]) probObj;
                    if (probas.length > 0) {
                        @SuppressWarnings("unchecked")
                        Map<Long, Float> map = (Map<Long, Float>) probas[0].getValue();
                        confidence = map.getOrDefault(label, 0.0f);
                    }
                }
            }
            
            String[] classes = {"Standard", "Gold", "Premium"};
            String recommended = (label >= 0 && label < classes.length) ? classes[(int) label] : "Standard";
            return new PromotionResult(recommended, confidence);
        }
    }

    private byte[] loadResource(String path) {
        try (InputStream is = getClass().getResourceAsStream(path)) {
            if (is == null) throw new RuntimeException("Model not found on classpath: " + path);
            return is.readAllBytes();
        } catch (Exception e) { throw new RuntimeException("Failed to load ONNX model: " + path, e); }
    }

    private float[] scaleNumericBlock(OrtSession scalerSession, float[] numericBlock) throws OrtException {
        try (OnnxTensor tensor = OnnxTensor.createTensor(env, new float[][]{numericBlock});
             OrtSession.Result result = scalerSession.run(Map.of("float_input", tensor))) {
            return ((float[][]) result.get(0).getValue())[0];
        }
    }
}