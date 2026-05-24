package com.autovantage.repository;

import com.autovantage.domain.CarListing;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface CarListingRepository extends JpaRepository<CarListing, UUID> {
    List<CarListing> findByBrand(String brand);

    // First page: order by timestamp descending, then ID descending
    List<CarListing> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    // Subsequent pages: use timestamp and ID as a tie-breaker
    @Query("SELECT c FROM CarListing c WHERE c.createdAt < :createdAt OR (c.createdAt = :createdAt AND c.id < :id) ORDER BY c.createdAt DESC, c.id DESC")
    List<CarListing> findNextPage(@Param("createdAt") LocalDateTime createdAt, @Param("id") UUID id, Pageable pageable);

    // First page for a specific user
    List<CarListing> findAllByUsernameOrderByCreatedAtDescIdDesc(String username, Pageable pageable);

    // Subsequent pages for a specific user
    @Query("SELECT c FROM CarListing c WHERE c.username = :username AND (c.createdAt < :createdAt OR (c.createdAt = :createdAt AND c.id < :id)) ORDER BY c.createdAt DESC, c.id DESC")
    List<CarListing> findNextPageByUsername(@Param("username") String username,
            @Param("createdAt") LocalDateTime createdAt, @Param("id") UUID id, Pageable pageable);

    @Query("SELECT c FROM CarListing c WHERE " +
            "(:brand IS NULL OR :brand = '' OR c.brand = :brand) AND " +
            "(:minPrice IS NULL OR c.price >= :minPrice) AND " +
            "(:maxPrice IS NULL OR c.price <= :maxPrice) " +
            "ORDER BY c.createdAt DESC, c.id DESC")
    List<CarListing> findFirstPageFiltered(@Param("brand") String brand, @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice, Pageable pageable);

    @Query("SELECT c FROM CarListing c WHERE " +
            "(:brand IS NULL OR :brand = '' OR c.brand = :brand) AND " +
            "(:minPrice IS NULL OR c.price >= :minPrice) AND " +
            "(:maxPrice IS NULL OR c.price <= :maxPrice) AND " +
            "(c.createdAt < :cursorTime OR (c.createdAt = :cursorTime AND c.id < :cursorId)) " +
            "ORDER BY c.createdAt DESC, c.id DESC")
    List<CarListing> findNextPageFiltered(@Param("cursorTime") LocalDateTime cursorTime,
            @Param("cursorId") UUID cursorId, @Param("brand") String brand, @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice, Pageable pageable);

}